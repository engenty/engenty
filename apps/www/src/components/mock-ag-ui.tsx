import { useWwwI18n } from "../i18n-provider";
import { ProductFrame } from "./product-frame";

export function MockAgUi() {
  const { copy } = useWwwI18n();
  const mock = copy.mocks.agUi;

  return (
    <ProductFrame crumb={mock.crumb}>
      <div className="relative min-h-[280px] bg-card p-5">
        <p className="font-heading font-semibold">{mock.title}</p>
        <p className="mt-1 font-mono text-[11px] text-ink-3">{mock.meta}</p>
        <p className="mt-4 text-ink-2 text-sm leading-relaxed">
          {mock.bodyBefore}{" "}
          <mark className="bg-ember-tint text-ink">{mock.bodyMark}</mark>{" "}
          {mock.bodyAfter}
        </p>
        <div className="mt-6 rounded-[6px] bg-paper-2 p-3 text-sm">
          <p className="font-medium text-cobalt text-xs">{mock.agentLabel}</p>
          <p className="mt-1 text-ink-2">{mock.agentBody}</p>
        </div>
        <div className="mt-3 flex gap-2 text-xs">
          <span className="rounded-[6px] bg-moss/15 px-2 py-1 text-moss">
            {mock.keep}
          </span>
          <span className="rounded-[6px] bg-amber/15 px-2 py-1 text-amber">
            {mock.refine}
          </span>
          <span className="rounded-[6px] bg-rose/10 px-2 py-1 text-rose">
            {mock.discard}
          </span>
        </div>
      </div>
    </ProductFrame>
  );
}
