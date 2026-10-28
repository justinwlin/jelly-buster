// Android uses vibration patterns. On iPhone, a real tap on the switch over the
// board supplies a system tick; scripted switch clicks only work on older iOS.
export class Haptics {
  enabled = true;
  private lastAt = 0;
  private readonly canVibrate = typeof navigator.vibrate === 'function';
  readonly iosTap = !this.canVibrate &&
    (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  private label: HTMLLabelElement | null = null;

  constructor() {
    if (!this.iosTap) return;
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.append(input);
    document.body.append(label);
    this.label = label;
  }

  pulse(pattern: number | number[]) {
    if (!this.enabled) return;
    const now = performance.now();
    if (now - this.lastAt < 30) return;
    this.lastAt = now;
    if (this.canVibrate) {
      try { navigator.vibrate(pattern); } catch { /* Unsupported vibration pattern. */ }
    } else if (this.label) {
      const ticks = Math.min(3, Math.ceil((typeof pattern === 'number' ? 1 : pattern.length) / 2));
      for (let i = 0; i < ticks; i++) setTimeout(() => this.label?.click(), i * 70);
    }
  }
}
