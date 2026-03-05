import { Component, OnInit } from '@angular/core';
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
import { ChartConfiguration, ChartData } from 'chart.js';
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
  private currentUser: any = null;
  userName: string = 'Usuario';
  userEmail: string = '';

  lastRecordDate: any = null;
  totalRecords: number = 0;

  formularioSimulacion: FormGroup;

  pagoMensual: number = 0;
  totalPagar: number = 0;
  totalInteres: number = 0;
  mostrarResultados: boolean = false;

  // Gráfica Circular
  public doughnutChartLabels: string[] = ['Capital', 'Interés'];
  public doughnutChartData: ChartData<'doughnut'> = {
    labels: this.doughnutChartLabels,
    datasets: [
      {
        data: [0, 0],
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

  // Gráfica de Barras
  public barChartLabels: string[] = [];
  public barChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      {
        data: [],
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

  constructor(
    private authService: AuthService,
    private router: Router,
    private fb: FormBuilder,
    private firestore: Firestore,
  ) {
    this.formularioSimulacion = this.fb.group({
      monto: [null, [Validators.required, Validators.min(1)]],
      tasaInteres: [null, [Validators.required, Validators.min(0)]],
      plazo: [null, [Validators.required, Validators.min(1)]],
    });
  }

  ngOnInit(): void {
    this.obtenerDatosUsuario();
  }

  obtenerDatosUsuario() {
    this.authService.usuarioActual$.subscribe((user: any) => {
      if (user) {
        this.currentUser = user;
        this.userName = user.displayName || 'Usuario';
        this.userEmail = user.email || 'Sin correo';
        this.obtenerEstadisticas(user.uid);
      }
    });
  }

  private async obtenerEstadisticas(uid: string) {
    try {
      const coleccionRef = collection(this.firestore, 'simulaciones');
      const consultaSimple = query(coleccionRef, where('uid', '==', uid));

      const snapshotTotal = await getCountFromServer(consultaSimple);
      this.totalRecords = snapshotTotal.data().count;

      const consultaUltima = query(
        coleccionRef,
        where('uid', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(1),
      );

      const snapshotUltima = await getDocs(consultaUltima);
      if (!snapshotUltima.empty) {
        const ultimoDoc = snapshotUltima.docs[0].data();
        this.lastRecordDate = ultimoDoc['createdAt']?.toDate();
      }
    } catch (e) {
      console.error('Error al traer estadísticas:', e);
    }
  }

  calcular() {
    if (this.formularioSimulacion.invalid) {
      this.formularioSimulacion.markAllAsTouched();
      return;
    }

    const { monto, tasaInteres, plazo } = this.formularioSimulacion.value;

    this.totalInteres = monto * (tasaInteres / 100) * plazo;
    this.totalPagar = monto + this.totalInteres;
    this.pagoMensual = this.totalPagar / plazo;

    this.doughnutChartData.datasets[0].data = [monto, this.totalInteres];

    const etiquetas: string[] = [];
    const saldos: number[] = [];
    for (let i = 1; i <= plazo; i++) {
      const saldoActual = this.totalPagar - this.pagoMensual * i;
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

    this.guardarSimulacion();
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