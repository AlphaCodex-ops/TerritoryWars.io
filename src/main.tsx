import * as ReactDOMClient from "react-dom/client"; // Changed import style
import App from "./App.tsx";
import "./globals.css";

ReactDOMClient.createRoot(document.getElementById("root")!).render(<App />); // Using the namespace object