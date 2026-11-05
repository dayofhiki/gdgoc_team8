"use client";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { BackIcon, CloseIcon, InfoIcon } from "./Icons";

type ScreenProps = { children: ReactNode; variant?: "default" | "sky" | "correct" | "wrong" };
export function Screen({ children, variant = "default" }: ScreenProps) {
  const cls = variant === "default" ? "screen" : `screen screen--${variant}`;
  return <main className={cls}>{children}</main>;
}

type HeaderProps = {
  title?: string;
  small?: boolean;
  back?: boolean | string | (() => void);
  onClose?: () => void;
};
export function Header({ title, small, back = true, onClose }: HeaderProps) {
  const router = useRouter();
  const goBack = () => {
    if (typeof back === "function") return back();
    if (typeof back === "string") return router.replace(back);
    router.back();
  };
  return (
    <header className="header">
      {back ? (
        <button className="icon-btn" aria-label="뒤로 가기" onClick={goBack}>
          <BackIcon />
        </button>
      ) : (
        <span />
      )}
      <h1 className={small ? "header__title header__title--sm" : "header__title"}>{title}</h1>
      {onClose ? (
        <button className="icon-btn" aria-label="닫기" onClick={onClose}>
          <CloseIcon />
        </button>
      ) : (
        <span />
      )}
    </header>
  );
}

export function Progress({ value, total, label = true, dark }: { value: number; total: number; label?: boolean; dark?: boolean }) {
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
      <div className="progress__track">
        <div className="progress__fill" style={{ width: `${(value / total) * 100}%` }} />
      </div>
      {label && (
        <p className={dark ? "progress__label progress__label--dark" : "progress__label"}>
          {dark ? `${value}/${total}` : <><b>{value}</b>/{total}</>}
        </p>
      )}
    </div>
  );
}

export function BottomCTA({ children, row }: { children: ReactNode; row?: boolean }) {
  return <div className={row ? "cta cta--row" : "cta"}>{children}</div>;
}

export function Notice({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <div className={dark ? "notice notice--dark" : "notice"}>
      <InfoIcon />
      <span>{children}</span>
    </div>
  );
}

export function Dialog({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="dim dim--center" onClick={onClose} role="dialog" aria-modal>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function BottomSheet({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="dim dim--bottom" onClick={onClose} role="dialog" aria-modal>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
