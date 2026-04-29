## Developer notes

### Setup

1. Install required dependencies
    ```bash
    npm install
    ```

2. Run the development server:
    ```
    npm run dev
    ```
    Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

    Since this is mainly used on mobile, you might wanna test the app on mobile natively. Start the server using:

    ```bash
    npm run dev -- -H your-ip-address
    ```

    How to get your ip address? Find it by running `ipconfig /all`.
    Then on your mobile browser, access using http://your-ip-address:3000