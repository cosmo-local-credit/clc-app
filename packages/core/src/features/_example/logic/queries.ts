import { useQuery } from "@tanstack/react-query";

const exampleKeys = {
  all: ["example"] as const,
  greeting: (name: string) => [...exampleKeys.all, "greeting", name] as const,
};

export function useGreetingQuery(name: string) {
  return useQuery({
    queryKey: exampleKeys.greeting(name),
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 250));
      return { message: `Hello, ${name}` };
    },
    enabled: name.length > 0,
  });
}
