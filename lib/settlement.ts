import type { Player } from "./types"

export type SettlementTransaction = { from: number; to: number; amount: number }

// Greedy debt-simplification: repeatedly match the largest creditor with the largest
// debtor, settling as much as possible between them. This minimizes the number of
// transactions needed to zero out every balance in the common case. All balances are
// assumed to already be whole dollars, so no rounding is needed here.
export function computeSettlement(balances: Record<number, number>, players: Player[]): SettlementTransaction[] {
  const ids = players.map((p) => p.id)
  let creditors = ids
    .filter((id) => (balances[id] ?? 0) > 0)
    .map((id) => ({ id, amount: balances[id] ?? 0 }))
  let debtors = ids
    .filter((id) => (balances[id] ?? 0) < 0)
    .map((id) => ({ id, amount: -(balances[id] ?? 0) }))

  const transactions: SettlementTransaction[] = []

  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort((a, b) => b.amount - a.amount)
    debtors.sort((a, b) => b.amount - a.amount)

    const creditor = creditors[0]
    const debtor = debtors[0]
    const amount = Math.min(creditor.amount, debtor.amount)

    if (amount > 0) {
      transactions.push({ from: debtor.id, to: creditor.id, amount })
    }

    creditor.amount -= amount
    debtor.amount -= amount

    creditors = creditors.filter((c) => c.amount > 0)
    debtors = debtors.filter((d) => d.amount > 0)
  }

  return transactions
}
