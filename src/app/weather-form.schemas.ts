import { z } from 'zod';

export const weatherLocationSchema = z.object({
  city: z.string().min(2, 'City must be at least 2 characters').max(50, 'City name is too long'),
  country: z
    .string()
    .min(2, 'Country must be at least 2 characters')
    .max(50, 'Country name is too long'),
});

export const weatherFormSchema = z.object({
  date: z
    .string()
    .min(1, 'Date is required')
    .refine(
      (date) => {
        const selectedDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return selectedDate >= today;
      },
      {
        message: 'Date cannot be in the past',
      },
    ),
  locations: z
    .array(weatherLocationSchema)
    .min(1, 'At least one location is required')
    .max(5, 'Maximum 5 locations allowed'),
  temperatureUnit: z.enum(['celsius', 'fahrenheit'], {
    errorMap: () => ({ message: 'Temperature unit is required' }),
  }),
});

export type WeatherFormData = z.infer<typeof weatherFormSchema>;
export type WeatherLocation = z.infer<typeof weatherLocationSchema>;
