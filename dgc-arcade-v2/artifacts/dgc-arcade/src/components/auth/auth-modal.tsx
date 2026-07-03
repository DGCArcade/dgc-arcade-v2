import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthModal } from "@/hooks/use-auth-modal";
import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";

export function AuthModal() {
  const { isOpen, close, view } = useAuthModal();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-[425px] border-primary/20 bg-card">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center font-display uppercase tracking-wider">
            {view === "login" ? "Welcome Back" : "Join the Crew"}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4">
          {view === "login" ? <LoginForm /> : <RegisterForm />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
