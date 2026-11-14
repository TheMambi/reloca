// Server-only — never bundle into the client. The user clicks
// "Generate report", a server action calls renderToBuffer() against this
// component, and the resulting Buffer is sent back to the client which
// turns it into a blob URL and triggers a download.

import "server-only";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { LeaseTerms } from "@/schemas/lease";
import type {
  MoveOutWalkthrough,
  MoveOutRoomRecord,
} from "@/schemas/move-out";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  header: { marginBottom: 18, borderBottom: "1pt solid #888", paddingBottom: 10 },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  subtle: { fontSize: 9, color: "#555" },
  metaRow: { flexDirection: "row", marginTop: 6, gap: 16 },
  metaLabel: { fontSize: 8, color: "#888", textTransform: "uppercase", marginBottom: 2 },
  metaValue: { fontSize: 10 },
  notesBlock: { marginTop: 12, marginBottom: 10 },
  notesLabel: { fontSize: 8, color: "#888", textTransform: "uppercase", marginBottom: 4 },
  notesText: { fontSize: 10, lineHeight: 1.4 },
  roomsHeading: { fontSize: 11, fontWeight: 700, marginTop: 10, marginBottom: 8 },
  roomBlock: { marginBottom: 14, paddingBottom: 12, borderBottom: "1pt solid #ddd" },
  roomTitle: { fontSize: 13, fontWeight: 700, marginBottom: 6 },
  ratingsRow: { flexDirection: "row", gap: 24, marginBottom: 6 },
  ratingLabel: { fontSize: 8, color: "#888", textTransform: "uppercase", marginBottom: 2 },
  ratingValue: { fontSize: 11 },
  fieldsTable: { marginTop: 4 },
  fieldRow: { flexDirection: "row", marginBottom: 3 },
  fieldLabel: { width: 84, fontSize: 9, color: "#666" },
  fieldValue: { flex: 1, fontSize: 9 },
  signature: {
    marginTop: 24,
    paddingTop: 14,
    borderTop: "1pt solid #000",
    flexDirection: "row",
    gap: 32,
  },
  sigCell: { flex: 1 },
  sigLabel: { fontSize: 8, color: "#888", textTransform: "uppercase" },
  sigLine: { marginTop: 18, borderBottom: "0.6pt solid #000", height: 1 },
  footer: { marginTop: 12, fontSize: 8, color: "#888", textAlign: "center" },
});

function formatDateLong(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00.000Z");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ratingStars(rating: number | null): string {
  if (rating == null) return "—";
  const filled = "★".repeat(rating);
  const empty = "☆".repeat(5 - rating);
  return `${filled}${empty}  (${rating}/5)`;
}

function leaseAddress(lease: LeaseTerms | null): string {
  if (!lease) return "—";
  const parts = [lease.property_name, lease.unit_address, lease.city].filter(
    Boolean,
  );
  return parts.join(" · ") || "—";
}

interface Props {
  walkthrough: MoveOutWalkthrough;
  rooms: MoveOutRoomRecord[];
  lease: LeaseTerms | null;
  household: { name: string };
}

export function WalkthroughReport({
  walkthrough,
  rooms,
  lease,
  household,
}: Props) {
  return (
    <Document
      title="Move-out walkthrough report"
      author={household.name}
      subject="Walkthrough record for deposit-protection / move-in inspection"
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Move-out walkthrough</Text>
          <Text style={styles.subtle}>
            Documented condition of the unit at handback / inspection.
          </Text>
          <View style={styles.metaRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaLabel}>Resident</Text>
              <Text style={styles.metaValue}>{household.name}</Text>
            </View>
            <View style={{ flex: 2 }}>
              <Text style={styles.metaLabel}>Unit</Text>
              <Text style={styles.metaValue}>{leaseAddress(lease)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.metaLabel}>Walkthrough date</Text>
              <Text style={styles.metaValue}>
                {formatDateLong(walkthrough.walkthrough_date)}
              </Text>
            </View>
          </View>
        </View>

        {walkthrough.overall_notes && walkthrough.overall_notes.trim() !== "" ? (
          <View style={styles.notesBlock}>
            <Text style={styles.notesLabel}>Overall notes</Text>
            <Text style={styles.notesText}>{walkthrough.overall_notes}</Text>
          </View>
        ) : null}

        <Text style={styles.roomsHeading}>
          Room-by-room ({rooms.length})
        </Text>

        {rooms.length === 0 ? (
          <Text style={styles.subtle}>
            No rooms documented. Add rooms in the walkthrough form before
            regenerating this report.
          </Text>
        ) : (
          rooms.map((room) => (
            <View key={room.id} style={styles.roomBlock} wrap={false}>
              <Text style={styles.roomTitle}>{room.room_name}</Text>

              <View style={styles.ratingsRow}>
                <View>
                  <Text style={styles.ratingLabel}>Condition</Text>
                  <Text style={styles.ratingValue}>
                    {ratingStars(room.condition_rating)}
                  </Text>
                </View>
                <View>
                  <Text style={styles.ratingLabel}>Cleanliness</Text>
                  <Text style={styles.ratingValue}>
                    {ratingStars(room.cleanliness_rating)}
                  </Text>
                </View>
              </View>

              <View style={styles.fieldsTable}>
                <Field label="Walls" value={room.walls_status} />
                <Field label="Floors" value={room.floors_status} />
                <Field label="Appliances" value={room.appliances_status} />
                <Field label="Fixtures" value={room.fixtures_status} />
                <Field label="Notes" value={room.notes} />
              </View>
            </View>
          ))
        )}

        <View style={styles.signature}>
          <View style={styles.sigCell}>
            <Text style={styles.sigLabel}>Resident signature</Text>
            <View style={styles.sigLine} />
          </View>
          <View style={styles.sigCell}>
            <Text style={styles.sigLabel}>Landlord / agent signature</Text>
            <View style={styles.sigLine} />
          </View>
          <View style={styles.sigCell}>
            <Text style={styles.sigLabel}>Date</Text>
            <View style={styles.sigLine} />
          </View>
        </View>

        <Text style={styles.footer}>
          Generated by Reloca · {formatDateLong(new Date().toISOString().slice(0, 10))}
        </Text>
      </Page>
    </Document>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value || value.trim() === "") return null;
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}
