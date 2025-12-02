import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideSignalFormsConfig } from '@angular/forms/signals';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideRouter(routes),
    // Automatically adds ng-valid, ng-invalid, ng-dirty, etc.
    /* provideSignalFormsConfig({
      classes: NG_STATUS_CLASSES
    }) */

      provideSignalFormsConfig({
      classes: {
        // 1. Success State: Green ring when valid and dirty (user typed something correct)
        'ring-2': (state) => state.valid() && state.dirty(),
        'ring-green-500': (state) => state.valid() && state.dirty(),
        'border-green-500': (state) => state.valid() && state.dirty(),

        // 2. Error State: Red ring when invalid and touched (user blurred the field)
        'ring-red-500': (state) => state.invalid() && state.touched(),
        'border-red-500': (state) => state.invalid() && state.touched(),
        'bg-red-50': (state) => state.invalid() && state.touched(),

        // 3. Pending State: Blue pulse during async validation (like our City check)
        'animate-pulse': (state) => state.pending(),
        'bg-blue-50': (state) => state.pending(),
      }
    })
  ],
};
