import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  // TODO: Agrega aquí tus propiedades y métodos de lógica
  loanAmount = 0;
  interestRate = 0;
  loanTermMonths = 0;
  monthlyPayment = 0;
  totalPayment = 0;
  totalInterest = 0;
}
