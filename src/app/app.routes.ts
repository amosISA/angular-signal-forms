import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./weather-chatbot.component').then((m) => m.WeatherChatbotComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./weather-dashboard.component').then((m) => m.WeatherDashboardComponent),
  },
];
