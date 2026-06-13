import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { setAuthToken } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { flushPendingGeo } from "@/lib/geo-sync";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuthModal } from "@/hooks/use-auth-modal";

const loginSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export function LoginForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loginMutation = useLogin();
  const authModal = useAuthModal();
  const [, setLocation] = useLocation();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    loginMutation.mutate({ data: values }, {
      onSuccess: (result) => {
        setAuthToken(result.token);
        queryClient.setQueryData(getGetMeQueryKey(), result.user);
        void flushPendingGeo();
        toast({ title: "Welcome back", description: "You have successfully logged in." });
        authModal.close();
        if (result.user.role === "admin") {
          setLocation("/admin");
        }
      },
      onError: (error) => {
        toast({
          title: "Login failed",
          description: error.data?.error || "An unexpected error occurred",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="Enter your username" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Enter your password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button 
          type="submit" 
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold uppercase tracking-wider" 
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? "Logging in..." : "Log In"}
        </Button>
        <div className="text-center text-sm text-muted-foreground mt-4">
          Don't have an account?{" "}
          <button 
            type="button" 
            className="text-primary hover:underline font-bold" 
            onClick={() => authModal.setView("register")}
          >
            Sign up
          </button>
        </div>
      </form>
    </Form>
  );
}
