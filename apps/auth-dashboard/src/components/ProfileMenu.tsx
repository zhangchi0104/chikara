import { ChevronDown, LogOut, UserRound } from "lucide-react";
import type { MouseEvent } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { operationLocation } from "@/lib/dashboard-operations.js";
import { cn } from "@/lib/utils";

interface ProfileMenuUser {
  readonly email: string;
  readonly name: string;
}

interface ProfileMenuProps {
  readonly compact?: boolean;
  readonly compactOnMobile?: boolean;
  readonly current?: boolean;
  readonly id: string;
  readonly label: string;
  readonly tone?: "dark" | "light";
  readonly user: ProfileMenuUser;
}

const menuItemClasses =
  "min-h-10 w-full cursor-pointer appearance-none gap-2.5 rounded-[8px] border-0 bg-transparent px-2.5 py-0 text-left text-[13px] font-[650] text-ink focus:bg-[#f1f3f6] focus:text-ink aria-[current=page]:bg-[#f1f3f6] [&[aria-current=page]_svg]:text-signal";

function submitAssociatedForm(event: MouseEvent<HTMLButtonElement>): void {
  // Radix unmounts the portaled item before the button's default submit runs.
  const form = event.currentTarget.form;
  if (!form) return;
  event.preventDefault();
  form.requestSubmit(event.currentTarget);
}

export default function ProfileMenu({
  compact = false,
  compactOnMobile = false,
  current = false,
  id,
  label,
  tone = "light",
  user,
}: ProfileMenuProps) {
  const initial = user.name.trim().slice(0, 1).toUpperCase() || "O";
  const isDark = tone === "dark";
  const triggerDetailsVisibilityClasses = cn(
    compact && "hidden",
    compactOnMobile && "mobile:hidden",
  );
  let menuContentVisibilityClasses: string | undefined;
  if (compact) {
    menuContentVisibilityClasses = "hidden mobile:block";
  } else if (!compactOnMobile) {
    menuContentVisibilityClasses = "mobile:hidden";
  }
  const logoutFormId = `${id}-logout`;

  return (
    <div
      className={cn(
        "min-w-0",
        compact ? "w-[46px]" : "w-full",
        compactOnMobile && "mobile:w-[46px]",
      )}
    >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Open account menu for ${user.name}`}
            className={cn(
              "group flex min-h-[46px] items-center gap-2.5 rounded-[10px] border border-transparent bg-transparent text-left",
              compact ? "w-[46px] p-[5px]" : "w-full p-1.5",
              compactOnMobile && "mobile:w-[46px] mobile:p-[5px]",
              isDark
                ? "text-[#eef2f8] hover:border-[#344158] hover:bg-[#1b273b] data-[state=open]:border-[#344158] data-[state=open]:bg-[#1b273b]"
                : "text-ink hover:border-line hover:bg-[#f6f7f9] data-[state=open]:border-line data-[state=open]:bg-[#f6f7f9]",
            )}
            type="button"
          >
            <span
              aria-hidden="true"
              className="grid size-[34px] shrink-0 place-items-center rounded-[8px] bg-[#2b3a54] font-bold text-white"
            >
              {initial}
            </span>
            <span
              className={cn(
                "grid min-w-0 flex-1",
                triggerDetailsVisibilityClasses,
              )}
            >
              <strong className="truncate text-[13px]">{user.name}</strong>
              <small
                className={cn(
                  "truncate text-[11px]",
                  isDark ? "text-[#aeb8c9]" : "text-ink-soft",
                )}
              >
                {label}
              </small>
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "grid shrink-0 text-ink-soft transition-transform duration-[160ms] group-data-[state=open]:rotate-180",
                triggerDetailsVisibilityClasses,
              )}
            >
              <ChevronDown size={16} strokeWidth={1.8} />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={isDark ? "start" : "end"}
          className={cn(
            "max-h-[min(420px,var(--radix-dropdown-menu-content-available-height))] w-[min(260px,calc(100vw-32px))] rounded-[12px] border border-line bg-paper p-0 text-ink shadow-[0_18px_42px_rgba(23,32,51,0.2)]",
            menuContentVisibilityClasses,
          )}
          collisionPadding={16}
          loop
          side={isDark ? "top" : "bottom"}
          sideOffset={10}
        >
          <DropdownMenuLabel className="grid gap-0.5 border-b border-line px-[15px] py-3.5">
            <strong className="truncate text-[14px] text-ink">
              {user.name}
            </strong>
            <small className="truncate text-[12px] font-normal text-ink-soft">
              {user.email}
            </small>
          </DropdownMenuLabel>
          <div className="grid gap-[3px] p-1.5">
            <DropdownMenuItem asChild className={menuItemClasses}>
              <a aria-current={current ? "page" : undefined} href="/profile">
                <UserRound className="size-[18px]" strokeWidth={1.8} />
                <span>Profile</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className={menuItemClasses}>
              <button
                form={logoutFormId}
                onClick={submitAssociatedForm}
                type="submit"
              >
                <LogOut className="size-[18px]" strokeWidth={1.8} />
                <span>Log out</span>
              </button>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <form
        action={operationLocation("sign-out", { returnTo: "/sign-in" })}
        className="hidden"
        id={logoutFormId}
        method="post"
      ></form>
    </div>
  );
}
