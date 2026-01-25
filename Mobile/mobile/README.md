# Vaultix Mobile Application

This is the mobile application for Vaultix, built with React Native and Expo.

## Setup Instructions

1.  **Install Dependencies**
    ```bash
    cd app/mobile
    npm install
    ```

2.  **Run the Application**
    - For iOS Simulator:
      ```bash
      npm run ios
      ```
    - For Android Emulator:
      ```bash
      npm run android
      ```
    - For Web:
      ```bash
      npm run web
      ```

## Folder Structure

- `src/screens`: Application screens (Home, Escrows, Profile).
- `src/components`: Reusable UI components.
- `src/navigation`: Navigation configuration (Tab Navigator).
- `src/services`: External services integration (Stellar SDK).
- `src/utils`: Utilities and Theme.
- `src/types`: TypeScript type definitions.

## Key Technologies

- **React Native (Expo)**: Cross-platform mobile framework.
- **TypeScript**: Static typing.
- **React Navigation**: Routing and navigation.
- **Stellar SDK**: Blockchain integration.

## Testing

Ensure you have the Expo Go app installed on your physical device or use an emulator/simulator.
Run `npm start` to launch the Expo development server.
