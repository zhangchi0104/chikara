# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## End-to-end tests with Maestro

[Maestro CLI](https://docs.maestro.dev/maestro-cli) requires Java 17 or newer and an
installed native build of the app on a running simulator or emulator.

1. Verify Java and install Maestro on macOS:

   ```bash
   java -version
   curl -fsSL "https://get.maestro.mobile.dev" | bash
   maestro --version
   ```

   Homebrew installation is also supported:

   ```bash
   brew tap mobile-dev-inc/tap
   brew trust --formula mobile-dev-inc/tap/maestro
   brew install mobile-dev-inc/tap/maestro
   ```

2. Start an iOS simulator or Android emulator. You can use Android Studio, Xcode,
   or Maestro's device command:

   ```bash
   maestro start-device --platform=ios
   # or
   maestro start-device --platform=android
   ```

3. Build and install the native Expo app from this directory:

   ```bash
   bun run e2e:build:ios
   # or
   bun run e2e:build:android
   ```

4. In another terminal, run the smoke flow from the repository root:

   ```bash
   bun run test:e2e
   ```

   During flow development, rerun automatically after changes with:

   ```bash
   bun run test:e2e:watch
   ```

The flow is stored in `.maestro/smoke.yaml` and targets the native app identifier
`com.zhangchi0104.chikara` on both platforms.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
