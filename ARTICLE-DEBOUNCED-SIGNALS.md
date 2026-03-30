# Debounced Signals in Angular 22

*How Angular turned signal debouncing into a first-class primitive — and why it returns a Resource.*

> **Commit**: [feat(core): allow debouncing signals](https://github.com/angular/angular/commit/b918beda323eefef17bf1de03fde3d402a3d4af0)  
> **Author**: Miles Malerba  
> **Status**: Experimental · **Angular 22.0.0-next.2+**

---

## TL;DR

Angular added a `debounced()` function that takes a signal and a wait time, and returns a **Resource**:

```
signal → debounced(signal, 500) → Resource<T>
```

The resource's `value()` holds the debounced value. Its `status` tells you whether the value is settled (`'resolved'`), still waiting (`'loading'`), or if the source threw (`'error'`). No RxJS, no `setTimeout` wrappers, no custom hooks. Just signals in, Resource out.

---

## The Problem

You have a search input. The user types "Tokyo". Without debouncing, you fire 5 HTTP requests �� one per keystroke. That's wasteful, potentially slow, and can cause race conditions if responses arrive out of order.

**The RxJS way:**

```typescript
searchControl.valueChanges.pipe(
  debounceTime(500),
  distinctUntilChanged(),
  switchMap(query => this.http.get(`/api/search?q=${query}`))
).subscribe(results => { ... });
```

**The manual way:**

```typescript
let timer: ReturnType<typeof setTimeout>;
function onInput(value: string) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    // now do something with value
  }, 500);
}
```

Both work. Neither integrates with signals. You end up bridging between observables or callbacks and signals, losing reactivity along the way.

The real gap: there was no signal-native way to debounce a value and get a reactive, composable result back.

---

## The Solution: `debounced()`

### The API

```typescript
import { debounced } from '@angular/core';

const search = signal('');
const debouncedSearch = debounced(() => search(), 500);
```

`debouncedSearch` is a `Resource<string>`. It has everything you'd expect:

- **`debouncedSearch.value()`** — the debounced value (updates only after 500ms of silence)
- **`debouncedSearch.status()`** — `'resolved'` when settled, `'loading'` while waiting, `'error'` if the source threw
- **`debouncedSearch.isLoading()`** — `true` while a value is pending
- **`debouncedSearch.error()`** — the error, if the source signal threw

### Full Signature

```typescript
function debounced<T>(
  source: () => T,
  wait: number | ((value: T, lastValue: ResourceSnapshot<T>) => Promise<void> | void),
  options?: DebouncedOptions<T>,
): Resource<T>;
```

- **`source`** — a reactive function (reads signals). Re-evaluated whenever its dependencies change.
- **`wait`** — milliseconds, or a custom function that controls when the value settles (more on this later).
- **`options`** — optional:
  - `injector` — for usage outside an injection context
  - `equal` — custom equality function to skip redundant updates

---

## How It Behaves

### Initial State

The resource starts `'resolved'` with the current value of the source. No initial loading flicker:

```typescript
const source = signal('hello');
const res = debounced(() => source(), 500);

// Immediately:
res.status(); // 'resolved'
res.value();  // 'hello'
```

This is a deliberate design choice — the initial value is read synchronously with `untracked()`, so there's no async gap on first render.

### When the Source Changes

1. Source signal updates
2. Resource enters `'loading'` — but **keeps the previous value**
3. Timer starts (or custom wait function fires)
4. If the source changes again before the timer completes, the timer **restarts**
5. Once the timer fires, the resource settles to `'resolved'` with the new value

```typescript
const source = signal('initial');
const res = debounced(() => source(), 100);

// After initial tick:
res.value();  // 'initial'
res.status(); // 'resolved'

source.set('updated');
// After change detection:
res.value();  // 'initial' (previous value kept!)
res.status(); // 'loading'

// After 100ms of silence:
res.value();  // 'updated'
res.status(); // 'resolved'
```

### Rapid Updates

When the source changes multiple times within the wait period, only the last value wins:

```typescript
source.set('a');
// 50ms later...
source.set('ab');
// 50ms later...
source.set('abc');
// 100ms after 'abc' (not after 'a')...
res.value(); // 'abc'
```

The timer resets on each change. Classic debounce — wait for the user to stop, then act.

### Error Handling

If the source signal throws, the resource enters `'error'` immediately — no waiting:

```typescript
const val = signal('ok');
const source = computed(() => {
  if (val() === 'bad') throw new Error('fail');
  return val();
});

const res = debounced(source, 100);

val.set('bad');
res.status(); // 'error'
res.error();  // Error('fail')
```

It stays in error state until the source produces a valid value **and** the debounce period passes. Recovery isn't instant:

```typescript
val.set('recovered');
res.status(); // 'error' — still waiting for the debounce

// After 100ms:
res.status(); // 'resolved'
res.value();  // 'recovered'
```

This makes sense if you think about it: if the source is flipping between valid and invalid rapidly, you don't want to flash between error and resolved states. The debounce applies to recovery too.

### The `params` Guard

One constraint worth knowing: you can't create a `debounced()` resource inside the `params` function of another resource. Angular will throw a `RuntimeError`:

```typescript
// ❌ This throws:
const res = resource({
  params: () => debounced(signal(1), 100), // RuntimeError!
  loader: async () => { ... },
});
```

This guard exists because `params` functions are tracked reactively and creating nested resources inside them would cause unpredictable behavior. The same restriction applies to `resource()` calls inside `params`.

---

## The Real Example: Search-as-You-Type Weather Dashboard

Here's how we use `debounced()` in our weather app. The user types a city name, and we only fetch weather data after they stop typing:

```typescript
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { debounced } from '@angular/core';

@Component({
  selector: 'app-weather-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input
      type="text"
      [value]="searchInput()"
      (input)="searchInput.set($any($event.target).value)"
      placeholder="Type a city name..."
    />

    @if (debouncedSearch.isLoading()) {
      <span>Waiting for you to stop typing...</span>
    }

    @if (weather.isLoading()) {
      <span>Fetching weather...</span>
    }

    @if (weather.value(); as data) {
      <h2>{{ data.city }} — {{ data.temperature.celsius }}°C</h2>
      <p>{{ data.condition.text }}</p>
    }
  `,
})
export class WeatherDashboardComponent {
  // Raw input — updates on every keystroke
  protected readonly searchInput = signal('London');

  // Debounced — only settles after 500ms of no typing
  protected readonly debouncedSearch = debounced(() => this.searchInput(), 500);

  // Derived city name — drives the HTTP request
  protected readonly selectedCity = computed(() => this.debouncedSearch.value() ?? 'London');

  // HTTP resource — only fires when selectedCity changes (after debounce)
  protected readonly weather = httpResource<WeatherData>(
    () => `/api/weather?city=${encodeURIComponent(this.selectedCity())}`,
  );
}
```

**What happens when the user types "Tokyo":**

1. **User types "T"**
   - `searchInput()` → `"T"`
   - `debouncedSearch.status()` → `'loading'`
   - `debouncedSearch.value()` → `"London"` (previous value kept)
   - No HTTP request fired

2. **User types "o", "k", "y", "o" (within 500ms)**
   - Timer keeps resetting
   - `debouncedSearch.status()` stays `'loading'`
   - Still showing London's weather, still no new request

3. **User stops typing (500ms passes)**
   - `debouncedSearch.status()` → `'resolved'`
   - `debouncedSearch.value()` → `"Tokyo"`
   - `selectedCity()` → `"Tokyo"`
   - `httpResource` fires **one** request for Tokyo

One request instead of five. And the UI shows a "debouncing..." indicator during the wait because `isLoading()` is `true`.

---

## Combining with `withPreviousValue()`

`debounced()` composes naturally with the snapshot composition pattern from Angular 21.2. You can debounce the input **and** keep old weather data visible while new data loads:

```typescript
import { withPreviousValue } from './with-previous-value';

export class WeatherDashboardComponent {
  protected readonly searchInput = signal('London');
  protected readonly debouncedSearch = debounced(() => this.searchInput(), 500);
  protected readonly selectedCity = computed(() => this.debouncedSearch.value() ?? 'London');

  protected readonly weather = withPreviousValue(
    httpResource<WeatherData>(
      () => `/api/weather?city=${encodeURIComponent(this.selectedCity())}`,
    ),
  );
}
```

The full pipeline:

```
searchInput (signal)
  → debounced() — waits 500ms, returns Resource<string>
    → computed() — extracts the settled value
      → httpResource() — fetches weather data
        → withPreviousValue() — keeps old data during loading
          → UI
```

Each piece is independent, composable, and reusable. `debounced()` doesn't know about `httpResource`. `withPreviousValue()` doesn't know about `debounced()`. They just work together because they all speak the same language: signals and resources.

---

## Custom Wait Functions

The `wait` parameter isn't limited to a number. You can pass a function for more control.

### Synchronous (No Debounce)

If your wait function returns `void` (not a Promise), the value settles immediately:

```typescript
const res = debounced(source, () => {
  // void return = synchronous, no debounce
});

source.set('new');
// Immediately:
res.value(); // 'new'
```

This might seem pointless, but it's useful for conditional debouncing — debounce some values, pass others through instantly.

### Adaptive Debouncing

The wait function receives the new value and the last snapshot, so you can vary the delay based on context:

```typescript
const res = debounced(
  source,
  (value, lastSnapshot) => {
    // Short queries → user probably still typing → longer wait
    // Longer queries → more specific → shorter wait
    const delay = value.length < 3 ? 1000 : 300;
    return new Promise(resolve => setTimeout(resolve, delay));
  },
);
```

### Promise-Based Control

Any async mechanism works — not just `setTimeout`:

```typescript
const res = debounced(
  source,
  async (value) => {
    // Wait for the next animation frame
    await new Promise(resolve => requestAnimationFrame(resolve));
  },
);
```

---

## Custom Equality

By default, `debounced()` uses `Object.is` to compare values. If the new value equals the current one, it skips the debounce entirely — no timer, no loading state:

```typescript
const source = signal('hello');
const res = debounced(() => source(), 500);

source.set('hello'); // Same value — stays 'resolved', no debounce triggered
```

This also works during the loading state: if the source changes to a value that's equal to the already-pending value, the timer doesn't restart.

For complex objects, provide a custom equality function:

```typescript
const source = signal({ id: 1, name: 'London' });

const res = debounced(() => source(), 500, {
  equal: (a, b) => a.id === b.id,
});

source.set({ id: 1, name: 'London (updated)' });
// Same id → no debounce triggered, stays 'resolved'
```

---

## `debounced()` vs `debounce()` — Two APIs, Different Jobs

Angular now has two debounce primitives. The names are a hint: `debounce` is a verb (an action you apply), `debounced` is an adjective (a thing you get back). They live in different packages and solve different problems.

### `debounced()` — from `@angular/core`

General-purpose signal debouncing. Takes any signal, returns a `Resource<T>`.

```typescript
import { debounced } from '@angular/core';

const search = signal('');
const debouncedSearch = debounced(() => search(), 500);

debouncedSearch.value();     // the debounced string
debouncedSearch.status();    // 'loading' | 'resolved' | 'error'
debouncedSearch.isLoading(); // true while waiting
```

- **Package**: `@angular/core`
- **Input**: any reactive function `() => T`
- **Output**: `Resource<T>` with value, status, error, isLoading
- **Scope**: works anywhere — components, services, standalone functions
- **What it debounces**: the **value** itself

### `debounce()` — from `@angular/forms/signals`

Form-field-specific. Delays when a field's async validators fire — not the field's value.

```typescript
import { debounce, validateAsync } from '@angular/forms/signals';

const weatherForm = form(data, (path) => {
  applyEach(path.locations, (location) => {
    debounce(location.city, 500);

    validateAsync(location.city, {
      params: (ctx) => ({ city: ctx.value(), country: /* ... */ }),
      factory: (params) => rxResource({ /* ... */ }),
      onSuccess: (results) => { /* ... */ },
    });
  });
});
```

- **Package**: `@angular/forms/signals`
- **Input**: a `SchemaPath` (form field path) + delay config
- **Output**: `void` — it configures the field as a side effect
- **Scope**: only inside `form()` / `schema()` configuration
- **What it debounces**: the **validation**, not the value

### The Key Difference

This is the part that trips people up. They look similar but operate at completely different levels:

```typescript
// debounced() — the VALUE is delayed
const debouncedCity = debounced(() => cityInput(), 500);
// debouncedCity.value() stays "London" for 500ms after typing "Tokyo"
// The value itself hasn't settled yet

// debounce() — the VALIDATION is delayed
debounce(path.city, 500);
// path.city's value updates to "Tokyo" IMMEDIATELY
// But validateAsync() doesn't fire until 500ms after the user stops typing
```

With `debounced()`, downstream consumers don't see the new value until the debounce settles. With `debounce()`, the field's value updates right away — only the async validator waits.

### The `'blur'` Mode

The forms `debounce()` supports something `debounced()` doesn't: debouncing until the field loses focus.

```typescript
debounce(location.city, 'blur');
```

This is useful for fields where partial values are meaningless — IBANs, coupon codes, usernames. There's no point validating "Lond" against an API when the user clearly isn't done typing. With `'blur'`, the validator only fires when the user tabs away or clicks elsewhere.

Under the hood, `'blur'` mode creates a Promise that **never self-resolves**. Only the `AbortSignal` — fired when the field loses focus or the form is submitted — can resolve it. This is also why submitting a form **never loses debounced validation**: submission marks all fields as touched, which fires the abort signal, flushing every pending debounce instantly.

### When to Use Which

- **Search input, filter, typeahead** that drives an `httpResource` or computation → **`debounced()`** from `@angular/core`
- **Async validation** on a form field (checking if a city exists, if a username is taken) → **`debounce()`** from `@angular/forms/signals`
- **Both in the same app?** Absolutely. In this project, the weather chatbot uses `debounce()` for city validation in the form, and the dashboard uses `debounced()` for the search input. Different problems, different layers, same app.

---

## Try It Yourself

The project includes a live demo at **`/dashboard`** with:

- A **search input** that uses `debounced()` — type a city name and watch the debounce status change in real-time
- A **"Debounced Signal State" panel** showing the raw input vs. debounced value and current status
- A toggle between **with/without snapshot composition** to see the difference
- **Quick-pick city buttons** that also go through the debounce pipeline

> Run `npm run dev` to start both the server and Angular, then visit `http://localhost:4200/dashboard`

---

## Under the Hood

<details>
<summary>How <code>debounced()</code> actually works — the cancellation-by-identity pattern</summary>

The implementation is about 125 lines. It uses three building blocks: `effect()` to track the source, a `signal<ResourceSnapshot<T>>()` for internal state, and `resourceFromSnapshots()` to turn it into a proper Resource.

Here's the core logic, simplified:

```typescript
function debounced<T>(
  source: () => T,
  wait: number | ((value: T, lastValue: ResourceSnapshot<T>) => Promise<void> | void),
  options?: DebouncedOptions<T>,
): Resource<T> {
  const injector = options?.injector ?? inject(Injector);

  const state = signal<ResourceSnapshot<T>>({
    status: 'resolved',
    value: untracked(() => source()), // Read initial value without tracking
  });

  let active: Promise<void> | void | undefined;
  let pendingValue: T | undefined;

  // Clean up on destroy
  injector.get(DestroyRef).onDestroy(() => {
    active = undefined;
  });

  effect(() => {
    let value: T;
    try {
      value = source(); // Track the source signal
    } catch (err) {
      state.set({ status: 'error', error: err as Error });
      active = pendingValue = undefined;
      return;
    }

    const currentState = untracked(state);
    const equal = options?.equal ?? Object.is;

    // Skip if value hasn't changed
    if (currentState.status === 'reloading' && equal(value, pendingValue!)) return;
    if (currentState.status === 'resolved' && equal(value, currentState.value!)) return;

    const waitFn = typeof wait === 'number'
      ? () => new Promise<void>(resolve => setTimeout(resolve, wait))
      : wait;

    const result = waitFn(value, currentState);

    if (result === undefined) {
      // Synchronous — resolve immediately
      state.set({ status: 'resolved', value });
      active = pendingValue = undefined;
    } else {
      // Async — enter loading state, keep current value
      if (currentState.status !== 'loading' && currentState.status !== 'error') {
        state.set({ status: 'loading', value: currentState.value });
      }
      active = result;
      pendingValue = value;

      result.then(() => {
        if (active === result) {  // ← The cancellation check
          state.set({ status: 'resolved', value });
          active = pendingValue = undefined;
        }
      });
    }
  }, { injector });

  return resourceFromSnapshots(state);
}
```

### The Cancellation-by-Identity Pattern

The most interesting design decision is how stale promises are handled. There's no `clearTimeout()` anywhere. Instead, Angular stores the current Promise reference in `active`:

```typescript
let active: Promise<void> | void | undefined;
active = result; // "this is the current wait"
```

When the promise resolves, it checks: **am I still the active one?**

```typescript
result.then(() => {
  if (active === result) {  // Still current? → update
    state.set({ status: 'resolved', value });
  }
  // Not current? → silently ignored
});
```

If the user typed again before the timer fired, `active` now points to a **new** Promise. The old one resolves, checks `active === result` → `false` → does nothing. No cancellation needed — just identity comparison.

This pattern is elegant because it works with any async mechanism, not just `setTimeout`. Custom wait functions, `requestAnimationFrame`, even manual Promise resolution — they all get the same cancellation behavior for free.

### Other Design Decisions

- **Starts resolved** — the initial value is read with `untracked()`, so there's no loading flicker on first render
- **Keeps previous value during loading** — `state.set({ status: 'loading', value: currentState.value })` preserves the old value
- **Uses `resourceFromSnapshots()`** — the same primitive from the snapshot composition feature, so `debounced()` returns a real `Resource<T>` with the full interface
- **Cleanup on destroy** — setting `active = undefined` in `DestroyRef.onDestroy()` ensures stale promises can't update state after the injector is destroyed
- **`params` guard** — wraps source reads in `setInParamsFunction(true/false)` so that creating a `debounced()` inside another resource's `params` throws immediately instead of causing subtle bugs

</details>

---

## Why This Matters

**It's signal-native.** No bridging between observables and signals. No `toSignal()` / `toObservable()` dance. Signals in, Resource out.

**It returns a Resource.** Not a plain signal — a `Resource<T>` with `status`, `isLoading()`, `hasValue()`, `error()`. Loading states come for free.

**It composes.** Because it returns a Resource, you can stack it with `withPreviousValue()`, `withFallback()`, or any other resource utility. The composition loop works:

```typescript
const weather = withPreviousValue(
  httpResource(() => `/api/weather?city=${debounced(() => city(), 500).value()}`)
);
```

**It handles the edge cases.** Equal values are skipped. Errors are caught immediately. Cleanup happens on destroy. Rapid updates only fire once. The timer restarts properly. Nested resource creation inside `params` is caught.

**It's tiny.** ~125 lines. No external dependencies. Ships with `@angular/core`.

---

## Quick Reference

- **`debounced(source, wait)`** — Creates a debounced `Resource<T>` from a signal
  - `source`: `() => T` — reactive function to debounce
  - `wait`: `number` (ms) or `(value, lastSnapshot) => Promise<void> | void`
  - Returns: `Resource<T>`

- **`DebouncedOptions<T>`** — Optional config
  - `injector?: Injector` — for out-of-context usage
  - `equal?: ValueEqualityFn<T>` — custom equality check

- **Status flow**: `'resolved'` → source changes → `'loading'` → wait completes → `'resolved'`
- **Error flow**: source throws → `'error'` → source recovers + wait completes → `'resolved'`

```
signal → debounced() → Resource<T> → .value(), .status(), .isLoading()
```

Every Angular app with a search input, a filter, or any user-driven reactive query just got simpler.
