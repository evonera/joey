export interface Plan {
  id: string;
  title: string;
  description: string;
  highlight?: boolean;
  type?: "monthly" | "yearly";
  currency?: string;
  monthlyPrice: string;
  yearlyPrice: string;
  buttonText: string;
  disabled?: boolean;
  badge?: string;
  features: {
    name: string;
    icon: string;
    iconColor?: string;
  }[];
}
