// Marca do Meu Comércio: um cupom com um visto. As cores vêm dos tokens, então a marca
// acompanha o tema claro e o escuro.
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ display: 'block', flex: 'none' }}
    >
      <rect width="40" height="40" rx="10" style={{ fill: 'var(--primary)' }} />
      <path
        d="M12 8h16v24l-2.7-2-2.6 2-2.7-2-2.7 2-2.7-2-2.6 2z"
        style={{ fill: 'var(--on-primary)' }}
      />
      <path
        d="M16.5 19.5l2.8 2.8 5.2-5.6"
        style={{
          fill: 'none',
          stroke: 'var(--primary)',
          strokeWidth: 2.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }}
      />
    </svg>
  );
}
