import {
  apply,
  applyEach,
  customError,
  maxLength,
  minLength,
  required,
  schema,
  validate,
} from '@angular/forms/signals';
import { WeatherLocation } from './multi-location-weather.component';
import { TemperatureUnit, WeatherFormData } from './types';

// 1. Atomic schemas - smallest reusable units
const cityNameSchema = schema<string>((path) => {
  required(path, { message: 'City is required' });
  minLength(path, 2, { message: 'City must be at least 2 characters' });
  maxLength(path, 50, { message: 'City name is too long' });
});

const countryNameSchema = schema<string>((path) => {
  required(path, { message: 'Country is required' });
  minLength(path, 2, { message: 'Country must be at least 2 characters' });
  maxLength(path, 50, { message: 'Country name is too long' });
});

// 2. Composite schema - combines atomic schemas
export const locationSchema = schema<WeatherLocation>((path) => {
  apply(path.city, cityNameSchema);
  apply(path.country, countryNameSchema);
});

// 3. Array schema with composite validation
export const locationsArraySchema = schema<WeatherLocation[]>((path) => {
  // Validate array itself
  validate(path, (ctx) => {
    if (ctx.value().length === 0) {
      return customError({
        kind: 'empty_array',
        message: 'At least one location is required',
      });
    }
    if (ctx.value().length > 5) {
      return customError({
        kind: 'too_many',
        message: 'Maximum 5 locations allowed',
      });
    }
    return null;
  });

  // Apply location schema to each item
  applyEach(path, locationSchema);
});

// 4. Date validation schema
export const futureDateSchema = schema<string>((path) => {
  required(path, { message: 'Date is required' });

  validate(path, (ctx) => {
    const selectedDate = new Date(ctx.value());
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      return customError({
        kind: 'past_date',
        message: 'Date cannot be in the past',
      });
    }

    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 14);

    if (selectedDate > maxDate) {
      return customError({
        kind: 'far_future',
        message: 'Weather forecasts only available for the next 14 days',
      });
    }

    return null;
  });
});

// 5. Temperature unit schema
export const temperatureUnitSchema = schema<TemperatureUnit>((path) => {
  required(path, { message: 'Temperature unit is required' });

  validate(path, (ctx) => {
    const value = ctx.value();
    if (value !== 'celsius' && value !== 'fahrenheit') {
      return customError({
        kind: 'invalid_unit',
        message: 'Temperature unit must be celsius or fahrenheit',
      });
    }
    return null;
  });
});

// 6. Complete form schema - orchestrates all schemas
export const weatherFormSchema = schema<WeatherFormData>((path) => {
  apply(path.date, futureDateSchema);
  apply(path.locations, locationsArraySchema);
  apply(path.temperatureUnit, temperatureUnitSchema);
});
