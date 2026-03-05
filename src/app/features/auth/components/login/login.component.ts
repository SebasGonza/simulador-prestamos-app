import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  errorMessage = '';
  isLoading = false;

  async loginConGoogle() {
    this.isLoading = true;

    try {
      await this.authService.loginGoogle();
      this.router.navigate(['/dashboard']);
    } catch (error: any) {
      this.errorMessage =
        'Ocurrió un error al iniciar sesión con Google. Inténtalo de nuevo.';
      console.error('Login error:', error);
    } finally {
      this.isLoading = false;
    }
  }
}
