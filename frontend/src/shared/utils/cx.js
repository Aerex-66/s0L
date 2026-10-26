/**
 * Tiny className utility — combines class strings, skipping falsy values.
 * Usage: cx('base', isActive && 'active', hasFile && 'has-file')
 */
export function cx(...args) {
  return args.filter(Boolean).join(' ')
}
