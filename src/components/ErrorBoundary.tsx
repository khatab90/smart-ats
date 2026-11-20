import { Component, type ReactNode } from "react";
import { t } from "../i18n";

/** Keeps a rendering error in one screen from blanking the whole app. */
export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { error: Error | null }
> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  override componentDidCatch(error: Error) {
    console.error("Screen crashed:", error);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="text-base font-bold text-ink">{t("تعذر عرض هذه الشاشة")}</p>
        <p className="mt-2 text-[13px] leading-6 text-muted">
          {t("حدث خطأ غير متوقع أثناء العرض. يمكنك إعادة المحاولة.")}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-5 rounded-2xl bg-brand-800 px-5 py-3 text-sm font-semibold text-white"
        >
          {t("إعادة المحاولة")}
        </button>
      </div>
    );
  }
}
