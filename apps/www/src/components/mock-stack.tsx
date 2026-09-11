import { useWwwI18n } from "../i18n-provider";
import { ProductFrame } from "./product-frame";

export function MockStack() {
  const { copy } = useWwwI18n();
  const mock = copy.mocks.stack;

  return (
    <ProductFrame crumb={mock.crumb}>
      <div className="min-h-[280px] space-y-4 bg-card p-5">
        <p className="font-heading font-semibold text-sm">{mock.title}</p>
        <ul className="space-y-3">
          {mock.rows.map((row) => (
            <li
              className="flex items-center justify-between gap-3 text-sm"
              key={row.job}
            >
              <span className="font-mono text-ink-3 text-xs uppercase">
                {row.job}
              </span>
              <span className="rounded-[6px] bg-paper-2 px-2 py-1 text-ink-2 text-xs">
                {row.name}
              </span>
            </li>
          ))}
        </ul>
        <p className="pt-4 text-ink-3 text-xs leading-relaxed">{mock.note}</p>
      </div>
    </ProductFrame>
  );
}
