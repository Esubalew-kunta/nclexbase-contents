"use client";

/** A switch with a genuine 44x44 tap target.
 *
 * The visible track is 44x24, which is too short to hit reliably on a phone, so
 * the button itself is 44px tall and the track is centred inside it via
 * absolute positioning. Earlier attempts to expand the hit area with an
 * absolutely-positioned ::before did not take effect, so the padding is on the
 * real element instead. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className="relative h-11 w-14 flex-none rounded-full"
    >
      <span
        className={`absolute left-1/2 top-1/2 h-6 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors ${
          checked ? "bg-brand-teal" : "bg-gray-300"
        }`}
      />
      <span
        className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-[left] ${
          checked ? "left-[1.75rem]" : "left-[0.375rem]"
        }`}
      />
    </button>
  );
}
