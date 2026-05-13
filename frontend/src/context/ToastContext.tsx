import { createContext, useCallback, useContext, useReducer, type ReactNode } from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastState {
  toasts: Toast[];
}

type Action =
  | { type: "push"; toast: Toast }
  | { type: "dismiss"; id: number };

function reducer(state: ToastState, action: Action): ToastState {
  switch (action.type) {
    case "push":
      return { toasts: [...state.toasts, action.toast] };
    case "dismiss":
      return { toasts: state.toasts.filter((t) => t.id !== action.id) };
  }
}

let nextId = 0;

interface ToastCtx {
  toast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { toasts: [] });

  const toast = useCallback((type: ToastType, message: string) => {
    const id = ++nextId;
    dispatch({ type: "push", toast: { id, type, message } });
    setTimeout(() => dispatch({ type: "dismiss", id }), 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    dispatch({ type: "dismiss", id });
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* toast container — fixed bottom-right */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {state.toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            onClick={() => dismiss(t.id)}
            className={`cursor-pointer rounded px-4 py-2 text-sm text-white shadow-lg transition-opacity ${
              t.type === "success"
                ? "bg-green-600"
                : t.type === "error"
                  ? "bg-red-600"
                  : "bg-blue-600"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
