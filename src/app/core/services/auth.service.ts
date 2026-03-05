import { inject, Injectable } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  user,
  User,
} from '@angular/fire/auth';
import {
  Firestore,
  doc,
  setDoc,
  serverTimestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // Observable para seguir el estado del usuario
  usuarioActual$: Observable<User | null>;

  constructor(
    private auth: Auth,
    private firestore: Firestore,
  ) {
    // Inicializamos el observable del usuario
    this.usuarioActual$ = user(this.auth);
  }

  // Método para iniciar sesión con Google
  async loginGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const result = await signInWithPopup(this.auth, provider);
      if (result.user) {
        // Si el login es exitoso, guardamos los datos en la base de datos
        await this.guardarDatosUsuario(result.user);
      }
    } catch (error: any) {
      // Si el usuario cierra el popup no lanzamos error
      if (error.code !== 'auth/popup-closed-by-user') {
        console.error('Error al iniciar sesión:', error);
        throw error;
      }
    }
  }

  // Función privada para crear o actualizar el perfil en Firestore
  private async guardarDatosUsuario(user: User) {
    const userRef = doc(this.firestore, `usuarios/${user.uid}`);
    const datosAGuardar = {
      uid: user.uid,
      nombreUsuario: user.displayName,
      correo: user.email,
      fechaCreacion: serverTimestamp(),
    };
    // Guardamos con merge para no borrar datos previos si existen
    return setDoc(userRef, datosAGuardar, { merge: true });
  }

  // Método simple para salir de la app
  async logout(): Promise<void> {
    await signOut(this.auth);
  }

  // Función para obtener el usuario actual de forma síncrona
  getCurrentUser(): User | null {
    return this.auth.currentUser;
  }
}
