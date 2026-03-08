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

    // Angular 21.2: provideSignalFormsConfig classes now receive a Field directive
    // (changed in 21.0.6 — the callback receives { state } instead of state directly)
    provideSignalFormsConfig({
      classes: {
        // Success State: Green ring when valid and dirty
        'ring-2': ({ state }) => state().valid() && state().dirty(),
        'ring-green-500': ({ state }) => state().valid() && state().dirty(),
        'border-green-500': ({ state }) => state().valid() && state().dirty(),

        // Error State: Red ring when invalid and touched
        'ring-red-500': ({ state }) => state().invalid() && state().touched(),
        'border-red-500': ({ state }) => state().invalid() && state().touched(),
        'bg-red-50': ({ state }) => state().invalid() && state().touched(),

        // Pending State: Blue pulse during async validation
        'animate-pulse': ({ state }) => state().pending(),
        'bg-blue-50': ({ state }) => state().pending(),
      },
    }),
  ],
};
