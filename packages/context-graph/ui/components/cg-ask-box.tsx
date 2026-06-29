import { useMutation } from "@engenty/query-client";
import { Button, Input } from "@engenty/ui-core";
import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { type AskResult, askGraph } from "../api.js";

interface Props {
  onClear: () => void;
  onResult: (result: AskResult) => void;
  result: AskResult | null;
}

const SUGGESTIONS = [
  "Who reports to Gruber?",
  "Who has the most direct reports?",
];

export function CgAskBox({ onClear, onResult, result }: Props) {
  const [question, setQuestion] = useState("");

  const ask = useMutation({
    mutationFn: (q: string) => askGraph(q),
    onSuccess: (r) => onResult(r),
  });

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || ask.isPending) {
      return;
    }
    setQuestion(trimmed);
    ask.mutate(trimmed);
  };

  const clear = () => {
    setQuestion("");
    ask.reset();
    onClear();
  };

  const errorMessage =
    ask.error instanceof Error
      ? ask.error.message
      : ask.error
        ? String(ask.error)
        : null;

  return (
    <div className="absolute top-3 left-3 z-10 flex w-80 flex-col gap-2 rounded-xl border border-border/80 bg-background/90 p-3 shadow-lg backdrop-blur-sm">
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
      >
        <div className="relative flex-1">
          <Sparkles className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-indigo-500" />
          <Input
            className="h-8 pl-7 text-xs"
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask the graph…"
            value={question}
          />
        </div>
        <Button
          className="h-8 px-3 text-xs"
          disabled={ask.isPending || !question.trim()}
          size="sm"
          type="submit"
        >
          {ask.isPending ? "…" : "Ask"}
        </Button>
        {(result || ask.error) && (
          <Button
            className="h-8 w-8 shrink-0"
            onClick={clear}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </form>

      {!(result || ask.isPending || ask.error) && (
        <div className="flex flex-wrap gap-1">
          {SUGGESTIONS.map((s) => (
            <button
              className="rounded-full border border-border/60 px-2 py-0.5 text-muted-foreground text-xxs transition-colors hover:bg-muted"
              key={s}
              onClick={() => submit(s)}
              type="button"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {errorMessage && (
        <p className="text-destructive text-xs">{errorMessage}</p>
      )}

      {result && (
        <div className="flex flex-col gap-1.5 border-t pt-2">
          <p className="text-foreground text-xs leading-relaxed">
            {result.answer}
          </p>
          <div className="flex items-center gap-1.5 text-muted-foreground text-xxs">
            <Sparkles className="h-3 w-3" />
            <span className="truncate">
              {result.nodeIds.length} node
              {result.nodeIds.length === 1 ? "" : "s"}
              {result.interpretation.edgeType
                ? ` · ${result.interpretation.edgeType}`
                : ""}
              {` · ${result.interpretation.direction}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
