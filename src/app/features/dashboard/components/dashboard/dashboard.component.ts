import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatDividerModule } from '@angular/material/divider';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import {
  Firestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getCountFromServer,
  getDocs,
  orderBy,
  limit,
} from '@angular/fire/firestore';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    BaseChartDirective,
    MatCardModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatToolbarModule,
    MatDividerModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  // Datos del usuario logueado
  private currentUser: any = null;
  userName: string = 'Usuario';
  userEmail: string = '';

  // Estadísticas del sistema
  lastRecordDate: any = null;
  totalRecords: number = 0;

  // Formulario del préstamo
  formularioSimulacion: FormGroup;

  // Resultados del cálculo
  pagoMensual: number = 0;
  totalPagar: number = 0;
  totalInteres: number = 0;
  mostrarResultados: boolean = false;

  // --- CONFIGURACIÓN DE GRÁFICAS ---

  // 1. Gráfica Circular (Doughnut) - Distribución Capital vs Interés
  public doughnutChartLabels: string[] = ['Capital', 'Interés'];
  public doughnutChartData: ChartData<'doughnut'> = {
    labels: this.doughnutChartLabels,
    datasets: [
      {
        data: [75, 25], // Datos de ejemplo
        backgroundColor: ['#6366f1', '#ef4444'],
        hoverBackgroundColor: ['#4f46e5', '#dc2626'],
        borderWidth: 0,
      },
    ],
  };
  public doughnutChartType = 'doughnut' as const;
  public doughnutChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { color: '#94a3b8', padding: 20 },
      },
    },
    cutout: '70%',
  };

  // 2. Gráfica de Barras - Proyección de Amortización (Ejemplo)
  public barChartLabels: string[] = [
    'Mes 1',
    'Mes 2',
    'Mes 3',
    'Mes 4',
    'Mes 5',
    'Mes 6',
  ];
  public barChartData: ChartData<'bar'> = {
    labels: this.barChartLabels,
    datasets: [
      {
        data: [1000, 850, 700, 550, 400, 250], // Datos de ejemplo
        label: 'Saldo Pendiente',
        backgroundColor: '#6366f1',
        borderColor: '#6366f1',
        borderRadius: 6,
      },
    ],
  };
  public barChartType = 'bar' as const;
  public barChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8' },
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#94a3b8' },
      },
    },
    plugins: {
      legend: {
        display: true,
        labels: { color: '#94a3b8' },
      },
    },
  };

  // El constructor nos sirve para inyectar todas las dependencias
  constructor(
    private authService: AuthService,
    private router: Router,
    private fb: FormBuilder,
    private firestore: Firestore,
  ) {
    // Creamos el formulario reactivo para capturar los datos del usuario
    this.formularioSimulacion = this.fb.group({
      monto: [null, [Validators.required, Validators.min(1)]],
      tasaInteres: [null, [Validators.required, Validators.min(0)]],
      plazo: [null, [Validators.required, Validators.min(1)]],
    });
  }

  // Al iniciar el componente cargamos los datos del usuario logueado
  ngOnInit(): void {
    this.obtenerDatosUsuario();
  }

  // Obtenemos la información de Firebase Auth
  obtenerDatosUsuario() {
    this.authService.usuarioActual$.subscribe((user) => {
      if (user) {
        this.currentUser = user;
        this.userName = user.displayName || 'Usuario';
        this.userEmail = user.email || 'Sin correo';
        // Buscamos las estadísticas solo de este usuario
        this.obtenerEstadisticas(user.uid);
      }
    });
  }

  // Consultamos en Firestore cuántas simulaciones ha hecho el usuario y la última fecha
  private async obtenerEstadisticas(uid: string) {
    try {
      // Definimos la consulta filtrando por el ID del usuario actual
      const coleccionRef = collection(this.firestore, 'simulaciones');
      const consultaSimple = query(coleccionRef, where('uid', '==', uid));

      // Contamos todos los documentos del usuario
      const snapshotTotal = await getCountFromServer(consultaSimple);
      this.totalRecords = snapshotTotal.data().count;

      // Buscamos solo el último registro para sacar la fecha
      const consultaUltima = query(
        coleccionRef,
        where('uid', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(1),
      );

      const snapshotUltima = await getDocs(consultaUltima);
      if (!snapshotUltima.empty) {
        const ultimoDoc = snapshotUltima.docs[0].data();
        // Convertimos el Timestamp de Firebase a un Date de JS
        this.lastRecordDate = ultimoDoc['createdAt']?.toDate();
      }
    } catch (e) {
      console.error('Error al traer estadísticas:', e);
    }
  }

  // Esta función se dispara cuando el usuario le da al botón de Calcular
  calcular() {
    // Si el formulario no es válido, marcamos los errores y no seguimos
    if (this.formularioSimulacion.invalid) {
      this.formularioSimulacion.markAllAsTouched();
      return;
    }

    // Tomamos los valores del formulario para hacer las cuentas
    const { monto, tasaInteres, plazo } = this.formularioSimulacion.value;

    // --- FORMULAS DEL PROFE ---
    // 1. Calcular el interés según la tasa y los meses
    this.totalInteres = monto * (tasaInteres / 100) * plazo;
    // 2. Sumamos todo para tener el total final
    this.totalPagar = monto + this.totalInteres;
    // 3. Dividimos entre los meses para sacar la cuota mensual
    this.pagoMensual = this.totalPagar / plazo;

    // Actualizamos el gráfico circular con los nuevos valores
    this.doughnutChartData.datasets[0].data = [monto, this.totalInteres];

    // Montamos la gráfica de barras para ver el saldo bajando mes a mes
    const etiquetas: string[] = [];
    const saldos: number[] = [];
    for (let i = 1; i <= plazo; i++) {
      const saldoActual = this.totalPagar - this.pagoMensual * i;

      // Controlamos que no se sature la gráfica si son muchos meses
      if (plazo <= 12 || i % Math.ceil(plazo / 12) === 0 || i === plazo) {
        etiquetas.push(`Mes ${i}`);
        saldos.push(Math.max(0, saldoActual));
      }
    }

    this.barChartLabels = etiquetas;
    this.barChartData = {
      labels: etiquetas,
      datasets: [
        {
          ...this.barChartData.datasets[0],
          data: saldos,
        },
      ],
    };

    // Guardamos la simulación para que el usuario no la pierda
    this.guardarSimulacion();

    // Activamos la bandera para que se vea el panel de resultados en el HTML
    this.mostrarResultados = true;
  }

  private async guardarSimulacion() {
    if (!this.currentUser) return;

    const datosAGuardar = {
      uid: this.currentUser.uid,
      nombreUsuario: this.currentUser.displayName,
      correo: this.currentUser.email,
      fechaCreacion: serverTimestamp(),
      montoPrestamo: this.formularioSimulacion.value.monto,
      tasaMensual: this.formularioSimulacion.value.tasaInteres,
      plazoMeses: this.formularioSimulacion.value.plazo,
      resultados: {
        cuotaMensual: this.pagoMensual,
        totalAPagar: this.totalPagar,
        totalIntereses: this.totalInteres,
      },
    };

    try {
      await addDoc(collection(this.firestore, 'simulaciones'), datosAGuardar);
      this.obtenerEstadisticas(this.currentUser.uid);
    } catch (error) {
      console.error('Error al guardar simulación:', error);
    }
  }

  cerrarSesion() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
