const mq = matchMedia('(min-width: 768px)');
let desktop = $state(mq.matches);
mq.addEventListener('change', () => { desktop = mq.matches; });

/** The single PC/mobile breakpoint (>= 768px = desktop). */
export const layout: { readonly desktop: boolean } = { get desktop() { return desktop; } };
