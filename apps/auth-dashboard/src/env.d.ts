/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    superuser: import("@chikara/auth/dashboard-contract").Superuser;
  }
}
