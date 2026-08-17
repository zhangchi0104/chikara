/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    account: import("@chikara/auth/dashboard-contract").AccountSession;
  }
}
