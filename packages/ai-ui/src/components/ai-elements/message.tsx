// AI Elements Message — streaming markdown transcript primitive (Streamdown).
"use client";

import {
  Button,
  ButtonGroup,
  ButtonGroupText,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@engenty/ui-core";
import type { UIMessage } from "ai";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ComponentProps, HTMLAttributes, ReactElement } from "react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type CjkPlugin,
  type CodeHighlighterPlugin,
  type MathPlugin,
  type PluginConfig,
  Streamdown,
} from "streamdown";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 text-sm",
      // User bubbles clip to rounded corners; assistant must not use overflow-hidden
      // or Streamdown code-block copy/download controls become unclickable (sticky break).
      "group-[.is-user]:overflow-hidden group-[.is-assistant]:overflow-x-clip",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionsProps = ComponentProps<"div">;

export const MessageActions = ({
  className,
  children,
  ...props
}: MessageActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
);

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

interface MessageBranchContextType {
  branches: ReactElement[];
  currentBranch: number;
  goToNext: () => void;
  goToPrevious: () => void;
  setBranches: (branches: ReactElement[]) => void;
  totalBranches: number;
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(
  null
);

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext);

  if (!context) {
    throw new Error(
      "MessageBranch components must be used within MessageBranch"
    );
  }

  return context;
};

export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  defaultBranch?: number;
  onBranchChange?: (branchIndex: number) => void;
};

export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch);
  const [branches, setBranches] = useState<ReactElement[]>([]);

  const handleBranchChange = useCallback(
    (newBranch: number) => {
      setCurrentBranch(newBranch);
      onBranchChange?.(newBranch);
    },
    [onBranchChange]
  );

  const goToPrevious = useCallback(() => {
    const newBranch =
      currentBranch > 0 ? currentBranch - 1 : branches.length - 1;
    handleBranchChange(newBranch);
  }, [currentBranch, branches.length, handleBranchChange]);

  const goToNext = useCallback(() => {
    const newBranch =
      currentBranch < branches.length - 1 ? currentBranch + 1 : 0;
    handleBranchChange(newBranch);
  }, [currentBranch, branches.length, handleBranchChange]);

  const contextValue = useMemo<MessageBranchContextType>(
    () => ({
      branches,
      currentBranch,
      goToNext,
      goToPrevious,
      setBranches,
      totalBranches: branches.length,
    }),
    [branches, currentBranch, goToNext, goToPrevious]
  );

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div
        className={cn("grid w-full gap-2 [&>div]:pb-0", className)}
        {...props}
      />
    </MessageBranchContext.Provider>
  );
};

export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageBranchContent = ({
  children,
  ...props
}: MessageBranchContentProps) => {
  const { currentBranch, setBranches, branches } = useMessageBranch();
  const childrenArray = useMemo(
    () => (Array.isArray(children) ? children : [children]),
    [children]
  );

  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray);
    }
  }, [childrenArray, branches.length, setBranches]);

  return (
    <>
      {childrenArray.map((branch, index) => (
        <div
          className={cn(
            "grid gap-2 overflow-hidden [&>div]:pb-0",
            index === currentBranch ? "block" : "hidden"
          )}
          key={index}
          {...props}
        >
          {branch}
        </div>
      ))}
    </>
  );
};

export type MessageBranchSelectorProps = ComponentProps<typeof ButtonGroup>;

export const MessageBranchSelector = ({
  className,
  ...props
}: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch();

  if (totalBranches <= 1) {
    return null;
  }

  return (
    <ButtonGroup
      className={cn(
        "[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md",
        className
      )}
      orientation="horizontal"
      {...props}
    />
  );
};

export type MessageBranchPreviousProps = ComponentProps<typeof Button>;

export const MessageBranchPrevious = ({
  children,
  ...props
}: MessageBranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronLeftIcon className="size-3.5" />}
    </Button>
  );
};

export type MessageBranchNextProps = ComponentProps<typeof Button>;

export const MessageBranchNext = ({
  children,
  ...props
}: MessageBranchNextProps) => {
  const { goToNext, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronRightIcon className="size-3.5" />}
    </Button>
  );
};

export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>;

export const MessageBranchPage = ({
  className,
  ...props
}: MessageBranchPageProps) => {
  const { currentBranch, totalBranches } = useMessageBranch();

  return (
    <ButtonGroupText
      className={cn(
        "border-none bg-transparent text-muted-foreground shadow-none",
        className
      )}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  );
};

export type MessageResponseProps = ComponentProps<typeof Streamdown>;

type StreamdownPluginMap = NonNullable<
  ComponentProps<typeof Streamdown>["plugins"]
>;

let streamdownPluginsPromise: Promise<StreamdownPluginMap> | null = null;

function loadStreamdownPlugins(): Promise<StreamdownPluginMap> {
  if (!streamdownPluginsPromise) {
    streamdownPluginsPromise = Promise.all([
      import("@streamdown/cjk"),
      import("@streamdown/code"),
      import("@streamdown/math"),
      import("@streamdown/mermaid"),
    ]).then(([cjkModule, codeModule, mathModule, mermaidModule]) => {
      // streamdown@2.5's `CodeHighlighterPlugin` adds `getSupportedLanguages()`,
      // which the latest published `@streamdown/code` (1.1.1) predates. streamdown
      // 2.5 declares it but never invokes it at runtime, so add a forward-compat
      // stub to satisfy the 2.5 type without changing behaviour.
      const code: CodeHighlighterPlugin = {
        ...codeModule.code,
        getSupportedLanguages: () => [],
      };
      // `@streamdown/{cjk,math}` (latest 1.x) are structurally identical to
      // streamdown@2.5's plugin types, but their remark/rehype `Pluggable` resolves
      // to a different `unified` declaration site — a type-only identity skew that's
      // runtime-safe. Narrow per-field casts (not a blanket map cast) bridge it.
      const plugins: PluginConfig = {
        cjk: cjkModule.cjk as CjkPlugin,
        code,
        math: mathModule.math as MathPlugin,
        mermaid: mermaidModule.mermaid,
      };
      return plugins;
    });
  }

  return streamdownPluginsPromise;
}

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => {
    const [plugins, setPlugins] = useState<StreamdownPluginMap>();

    useEffect(() => {
      let mounted = true;

      void loadStreamdownPlugins().then((loadedPlugins) => {
        if (mounted) {
          setPlugins(loadedPlugins);
        }
      });

      return () => {
        mounted = false;
      };
    }, []);

    return (
      <Streamdown
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          // Streamdown uses list-inside on ol/ul; with typical AI markdown (block-ish li content)
          // markers render on their own line. Outside + padding matches normal list layout.
          "[&_ol]:!list-outside [&_ul]:!list-outside [&_ol]:pl-5 [&_ul]:pl-5",
          // Streamdown defaults bg-sidebar; Engenty maps that to ember-strong (red).
          "[&_[data-streamdown=table-wrapper]]:bg-card",
          "[&_[data-streamdown=table-wrapper]]:border-border/60",
          "[&_[data-streamdown=code-block]]:bg-card",
          "[&_[data-streamdown=code-block]]:border-border/60",
          // Streamdown always renders a code-block header row; hide it when no language label.
          "[&_[data-streamdown=code-block-header][data-language='']]:hidden",
          "[&_[data-streamdown=code-block-header]:has(>span:empty)]:hidden",
          // Sticky + pointer-events-none actions break in nested scroll/overflow containers.
          "[&_[data-streamdown=code-block]]:relative",
          "[&_[data-streamdown=code-block]>div:has(>[data-streamdown=code-block-actions])]:pointer-events-auto",
          "[&_[data-streamdown=code-block]>div:has(>[data-streamdown=code-block-actions])]:!absolute",
          "[&_[data-streamdown=code-block]>div:has(>[data-streamdown=code-block-actions])]:top-2",
          "[&_[data-streamdown=code-block]>div:has(>[data-streamdown=code-block-actions])]:right-2",
          "[&_[data-streamdown=code-block]>div:has(>[data-streamdown=code-block-actions])]:z-[1]",
          "[&_[data-streamdown=code-block]>div:has(>[data-streamdown=code-block-actions])]:!mt-0",
          "[&_[data-streamdown=code-block]:has([data-streamdown=code-block-actions])_[data-streamdown=code-block-body]]:pt-8",
          "[&_[data-streamdown=mermaid-block]]:relative",
          "[&_[data-streamdown=mermaid-block]]:bg-card",
          "[&_[data-streamdown=mermaid-block]]:border-border/60",
          "[&_[data-streamdown=mermaid-block]>div:has(>[data-streamdown=mermaid-block-actions])]:pointer-events-auto",
          "[&_[data-streamdown=mermaid-block]>div:has(>[data-streamdown=mermaid-block-actions])]:!absolute",
          "[&_[data-streamdown=mermaid-block]>div:has(>[data-streamdown=mermaid-block-actions])]:top-2",
          "[&_[data-streamdown=mermaid-block]>div:has(>[data-streamdown=mermaid-block-actions])]:right-2",
          "[&_[data-streamdown=mermaid-block]>div:has(>[data-streamdown=mermaid-block-actions])]:z-[1]",
          "[&_[data-streamdown=mermaid-block]>div:has(>[data-streamdown=mermaid-block-actions])]:!mt-0",
          "[&_[data-streamdown=code-block-actions]]:border-border/60 [&_[data-streamdown=code-block-actions]]:bg-card/90",
          className
        )}
        plugins={plugins}
        {...props}
      />
    );
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

MessageResponse.displayName = "MessageResponse";

export type MessageToolbarProps = ComponentProps<"div">;

export const MessageToolbar = ({
  className,
  children,
  ...props
}: MessageToolbarProps) => (
  <div
    className={cn(
      "mt-4 flex w-full items-center justify-between gap-4",
      className
    )}
    {...props}
  >
    {children}
  </div>
);
