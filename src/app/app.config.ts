import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideSignalFormsConfig } from '@angular/forms/signals';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),

    // Angular 21.2: classes callback receives FormField<unknown> directive instance
    provideSignalFormsConfig({
      classes: {
        // Success State: Green ring when valid and dirty
        'ring-2': (field) => field.state().valid() && field.state().dirty(),
        'ring-green-500': (field) => field.state().valid() && field.state().dirty(),
        'border-green-500': (field) => field.state().valid() && field.state().dirty(),

        // Error State: Red ring when invalid and touched
        'ring-red-500': (field) => field.state().invalid() && field.state().touched(),
        'border-red-500': (field) => field.state().invalid() && field.state().touched(),
        'bg-red-50': (field) => field.state().invalid() && field.state().touched(),

        // Pending State: Blue pulse during async validation
        'animate-pulse': (field) => field.state().pending(),
        'bg-blue-50': (field) => field.state().pending(),
      },
    }),
  ],
};
