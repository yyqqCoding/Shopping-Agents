import { equipmentById } from "@/lib/catalog";
import { LandingPage } from "@/components/landing/LandingPage";
import "./landing.css";

export default function WelcomePage() {
  const ids = [
    "OD-3006",
    "OD-7008",
    "OD-7009",
    "OD-7010",
    "OD-7011",
    "OD-7001",
    "OD-2003",
    "OD-2004",
    "OD-2005",
    "OD-2006",
    "OD-2007",
    "OD-6001",
    "OD-6002",
    "OD-6003",
    "OD-6004",
    "OD-6005",
    "OD-7005",
    "OD-7003",
    "OD-7006",
    "OD-7004",
    "OD-7007",
  ];
  const products = ids
    .map((id) => equipmentById(id))
    .filter((product): product is NonNullable<typeof product> =>
      Boolean(product),
    );
  return <LandingPage products={products} />;
}
