import type { Metadata } from "next";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { LifecycleTracker } from "@/components/transitions/lifecycle-tracker";
import { utilityConfig } from "@/components/transitions/utility-config";
import { addressConfig } from "@/components/transitions/address-config";
import { AddRowDialog } from "@/components/transitions/add-row-dialog";
import { RowEditDialog } from "@/components/transitions/row-edit-dialog";
import {
  getUtilityTransitions,
  getAddressTargets,
} from "@/lib/data/transitions-db";
import {
  deleteUtilityTransition,
  deleteAddressTarget,
} from "./actions";

export const metadata: Metadata = {
  title: "Transitions",
  description:
    "Track utility cutovers and address updates side by side — origin shutoffs, destination turn-ons, and who needs your new address.",
};

export const dynamic = "force-dynamic";

export default async function TransitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab =
    tab === "address-updates" ? "address-updates" : "utilities";

  const [utilities, targets] = await Promise.all([
    getUtilityTransitions(),
    getAddressTargets(),
  ]);

  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col gap-6 p-6">
      <header>
        <p className="label-cap text-[10px] tracking-wider text-muted-foreground">
          LOGISTICS · TRANSITIONS
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-[var(--tracking-headline)] text-foreground">
          Utilities & address updates
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Cut off services at your old place, turn them on at the new one, and
          keep a list of everyone who needs your new address.
        </p>
      </header>

      <Tabs defaultValue={initialTab} className="gap-4">
        <TabsList>
          <TabsTrigger value="utilities">Utilities</TabsTrigger>
          <TabsTrigger value="address-updates">Address updates</TabsTrigger>
        </TabsList>

        <TabsContent value="utilities" className="mt-2">
          <LifecycleTracker
            rows={utilities}
            config={utilityConfig}
            onAdd={<AddRowDialog scope="utility" rows={utilities} />}
            renderEdit={(row) => <RowEditDialog scope="utility" row={row} />}
            onDelete={deleteUtilityTransition}
            emptyHint="Pick a utility above to start tracking it."
          />
        </TabsContent>

        <TabsContent value="address-updates" className="mt-2">
          <LifecycleTracker
            rows={targets}
            config={addressConfig}
            onAdd={<AddRowDialog scope="address" />}
            renderEdit={(row) => <RowEditDialog scope="address" row={row} />}
            onDelete={deleteAddressTarget}
            emptyHint="Pick a recipient above so we can keep the deadline."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
