import { useWwwI18n } from "../i18n-provider";
import { ProductFrame } from "./product-frame";

export function MockSpaceHome() {
  const { copy } = useWwwI18n();
  const mock = copy.mocks.spaceHome;

  return (
    <ProductFrame crumb={mock.crumb}>
      <div className="flex min-h-[280px] bg-card">
        <aside className="flex w-12 flex-col items-center gap-3 border-transparent py-3">
          {["•", "•", "•", "•"].map((dot, i) => (
            <span
              className={`size-7 rounded-md ${i === 0 ? "bg-ember-tint text-ember" : "text-ink-3"} flex items-center justify-center font-mono text-xs`}
              key={`rail-${String(i)}`}
            >
              {dot}
            </span>
          ))}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
          <div className="flex items-center justify-between">
            <p className="font-heading font-semibold text-sm">
              {mock.spaceName}
            </p>
            <span className="rounded-full bg-cobalt/10 px-2 py-0.5 font-mono text-[10px] text-cobalt">
              {mock.people}
            </span>
          </div>
          <div className="flex gap-4 font-medium text-ink-3 text-xs">
            {mock.tabs.map((tab, i) => (
              <span
                className={
                  i === 0
                    ? "text-ink underline decoration-2 decoration-ember underline-offset-4"
                    : undefined
                }
                key={tab}
              >
                {tab}
              </span>
            ))}
          </div>
          <div className="rounded-[6px] bg-paper-2 px-3 py-2 text-ink-3 text-sm">
            {mock.ask}
          </div>
          <ul className="space-y-2">
            {mock.apps.map((app) => (
              <li
                className="flex items-center justify-between text-sm"
                key={app.name}
              >
                <span className={app.mounted ? "text-ink" : "text-ink-3"}>
                  {app.name}
                </span>
                <span
                  className={`font-mono text-[10px] ${app.mounted ? "text-moss" : "text-ink-3"}`}
                >
                  {app.mounted ? mock.statusMounted : mock.statusPlugin}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ProductFrame>
  );
}
