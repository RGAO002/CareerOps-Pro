// frontend/src/hooks/usePageContext.ts
import { useEffect } from "react";
import { usePageContextStore, type PageContext } from "@/stores/pageContext";

/**
 * Register a page's AI context on mount, clear it on unmount.
 * Call this once per page. The summary feeds into the AI system prompt.
 *
 * Example:
 *   usePageContext({
 *     page: "resume_editor",
 *     summary: `正在编辑「${resume.name}」简历，目标 ${jobTitle ?? "未指定"}`,
 *   });
 */
export function usePageContext(ctx: PageContext) {
  const setPageContext   = usePageContextStore((s) => s.setPageContext);
  const clearPageContext = usePageContextStore((s) => s.clearPageContext);

  useEffect(() => {
    setPageContext(ctx);
    return () => clearPageContext();
    // Re-register if any field of ctx changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.page, ctx.summary, JSON.stringify(ctx.data)]);
}
