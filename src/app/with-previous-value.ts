import { linkedSignal, Resource, ResourceSnapshot, resourceFromSnapshots } from '@angular/core';

/**
 * Resource composition via snapshots — Angular 21.2
 *
 * Wraps any `Resource<T>` so that when it enters the `'loading'` state
 * (e.g. because its reactive params changed), the *previous* resolved value
 * is preserved instead of being replaced with `undefined`.
 *
 * The composition loop:
 *   Resource → .snapshot → transform with linkedSignal → resourceFromSnapshots() → Resource
 *
 * This is a generic, reusable utility that works with any Resource<T>:
 * httpResource, rxResource, custom resource, etc.
 */
export function withPreviousValue<T>(input: Resource<T>): Resource<T> {
  const derived = linkedSignal({
    source: input.snapshot,
    computation: (
      snap: ResourceSnapshot<T>,
      previous: { value: ResourceSnapshot<T> } | undefined,
    ) => {
      if (snap.status === 'loading' && previous?.value && previous.value.status !== 'error') {
        // Resource is reloading — keep the previous value instead of showing undefined
        return { status: 'loading' as const, value: previous.value.value };
      }
      // Otherwise, forward the snapshot as-is
      return snap;
    },
  });

  return resourceFromSnapshots(derived);
}
