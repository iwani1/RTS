import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, serviceAgreements } from "@/db/schema";
import { ActionForm } from "@/components/action-form";
import {
  EmptyState,
  MetricStrip,
  MetricCell,
  PageHeader,
  Panel,
  TableWrap,
  TBody,
  TD,
  TDPrimary,
  THead,
  TH,
  TR,
} from "@/components/ui";
import { Field } from "@/components/ui/input";
import { updateExchangeRateAction } from "@/app/actions/platform";
import { requireSection } from "@/lib/auth";
import { convert, formatMoney, listCurrencies } from "@/lib/currency";
import { money, n } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Currencies.
 *
 * The base currency is the Ghanaian cedi. Every other rate is "units of that
 * currency per one cedi", which is how the rate table is stored and how a
 * conversion is made. Rates are indicative and dated — an operator sets them
 * from a provider, and the date is on the row so a reader knows how fresh
 * they are.
 */
export default async function CurrenciesPage() {
  await requireSection("currencies");

  const currencies = await listCurrencies();
  const base = currencies.find((c) => c.isBase) ?? currencies[0];

  const agreements = await db
    .select({
      id: serviceAgreements.id,
      name: serviceAgreements.name,
      currency: serviceAgreements.currency,
      unitRate: serviceAgreements.unitRate,
      pricingModel: serviceAgreements.pricingModel,
      company: companies.name,
    })
    .from(serviceAgreements)
    .leftJoin(companies, eq(companies.id, serviceAgreements.companyId))
    .orderBy(asc(serviceAgreements.name));

  const sample = 1000;
  const converted = base
    ? currencies
        .filter((c) => !c.isBase)
        .map((c) => ({
          code: c.code,
          value: formatMoney(convert(sample, base.code, c.code, currencies), c.code, currencies),
          asOf: c.asOf,
        }))
    : [];

  return (
    <div>
      <PageHeader
        eyebrow="Govern"
        title="Currencies"
        subtitle="Exchange rates against the base currency, and the currency each client is billed in."
      />

      <MetricStrip className="mt-4">
        <MetricCell label="Currencies" value={String(currencies.length)} />
        <MetricCell label="Base currency" value={base?.code ?? "GHS"} hint={base?.name} />
        <MetricCell label="Rate date" value={base?.asOf ?? "—"} />
        <MetricCell
          label={`${sample.toLocaleString("en-GH")} ${base?.code ?? "GHS"} in USD`}
          value={converted.find((c) => c.code === "USD")?.value ?? "—"}
        />
        <MetricCell
          label="Client agreements"
          value={String(agreements.length)}
        />
      </MetricStrip>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel
          eyebrow="Rates"
          title="Exchange rates"
          subtitle="Units of each currency per one GHS. Update a rate to refresh the whole system."
          padded={false}
        >
          {currencies.length === 0 ? (
            <EmptyState
              title="No currencies configured"
              hint="Add rows to the exchange_rates table, or run the seed."
            />
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Rate to base</TH>
                  <TH>As of</TH>
                  <TH>Update</TH>
                </TR>
              </THead>
              <TBody>
                {currencies.map((currency) => (
                  <TR key={currency.code}>
                    <TDPrimary>
                      <span className="numeric text-[12.5px]">
                        {currency.symbol} {currency.code}
                      </span>
                    </TDPrimary>
                    <TD>{currency.name}</TD>
                    <TD className="numeric">
                      {currency.isBase ? "1 (base)" : currency.rateToBase.toFixed(6)}
                    </TD>
                    <TD className="numeric">{currency.asOf}</TD>
                    <TD>
                      {currency.isBase ? (
                        <span className="text-[11.5px] text-ink-3">—</span>
                      ) : (
                        <ActionForm
                          action={updateExchangeRateAction}
                          submitLabel="Save"
                          submitVariant="secondary"
                          footer={
                            <input type="hidden" name="code" value={currency.code} />
                          }
                        >
                          <input
                            type="number"
                            name="rateToBase"
                            step="0.000001"
                            min="0.000001"
                            required
                            defaultValue={currency.rateToBase.toFixed(6)}
                            className="numeric h-7 w-32 rounded-[8px] border border-line-strong bg-surface-1 px-2 text-[12px] text-ink"
                            aria-label={`New rate for ${currency.code}`}
                          />
                        </ActionForm>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel eyebrow="Reference" title="What the base is worth">
            {converted.length === 0 ? (
              <EmptyState title="No foreign currencies" hint="Only the base currency is configured." />
            ) : (
              <ul className="space-y-2">
                {converted.map((row) => (
                  <li key={row.code} className="flex items-center justify-between text-[12.5px]">
                    <span className="numeric text-ink">{row.code}</span>
                    <span className="numeric text-ink-3">
                      {row.value} <span className="text-ink-3">· {row.asOf}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            eyebrow="Billing"
            title="Client agreements"
            subtitle="Each agreement is billed in its own currency."
            padded={false}
          >
            {agreements.length === 0 ? (
              <EmptyState title="No agreements" hint="Nothing is under contract yet." />
            ) : (
              <TableWrap>
                <THead>
                  <TR>
                    <TH>Client</TH>
                    <TH>Agreement</TH>
                    <TH>Currency</TH>
                    <TH>Rate</TH>
                  </TR>
                </THead>
                <TBody>
                  {agreements.map((row) => (
                    <TR key={row.id}>
                      <TDPrimary>{row.company ?? "—"}</TDPrimary>
                      <TD>{row.name}</TD>
                      <TD className="numeric">{row.currency}</TD>
                      <TD className="numeric">{money(n(row.unitRate), row.currency)}</TD>
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
            )}
          </Panel>

          <Panel eyebrow="Note" title="How rates are used">
            <p className="text-[12.5px] leading-relaxed text-ink-2">
              An amount in one currency converts to another through the base
              currency, using the rate on the row. The rate is recorded with its
              date, and an invoice keeps the currency it was raised in — a past
              invoice never re-prices when a rate changes. Rates in this
              environment are an indicative snapshot, not a live feed; a
              production deployment refreshes them from a provider.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
