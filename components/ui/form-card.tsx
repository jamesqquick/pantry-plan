import { Card, CardHeader, CardTitle, CardContent, CardAction } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type FormCardProps = {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function FormCard({ title, children, action, className }: FormCardProps) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {action != null ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
