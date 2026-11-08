import { Skeleton } from '@/frontend/ui/skeleton';

const FIELDS = [0, 1];

// The inside of the sign in card while the system status is checked: title, two fields and a button.
export function AuthFormSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Verificando o sistema…</span>

      <div aria-hidden="true">
        <div className="auth-header">
          <Skeleton width={90} height={27} />
          <Skeleton width={220} height={17} style={{ marginTop: 4 }} />
        </div>

        <div className="auth-form">
          {FIELDS.map((field) => (
            <div key={field}>
              <Skeleton width={70} height={17} />
              <Skeleton height={56} radius={12} style={{ marginTop: 8 }} />
            </div>
          ))}
          <Skeleton height={56} radius={12} style={{ marginTop: 4 }} />
        </div>
      </div>
    </div>
  );
}
