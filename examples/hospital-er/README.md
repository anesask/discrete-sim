# Hospital Emergency Room Simulation

This example demonstrates the practical benefits of **priority queue disciplines** in a realistic healthcare scenario.

## Scenario

A hospital emergency room with:
- **2 doctors** available to treat patients
- **30 patients** arriving over a 60-minute window
- **Three triage levels**:
  - 🔴 **Critical** (20%) - Life-threatening emergencies, priority 1
  - 🟡 **Urgent** (40%) - Serious but not immediately life-threatening, priority 2
  - 🟢 **Routine** (40%) - Non-urgent cases, priority 3

## Queue Disciplines Compared

### FIFO (First-Come, First-Served)
Traditional queue where patients are treated in arrival order, regardless of severity.

### Priority Queue (Triage-Based)
Patients are treated based on medical urgency (triage level), ensuring critical cases receive immediate attention.

## Running the Example

```bash
npx tsx examples/hospital-er/index.ts
```

## Expected Output

```
🏥 Hospital Emergency Room Simulation

════════════════════════════════════════════════════════════

Scenario: 30 patients, 2 doctors, 60-minute arrival window
Patient mix: 20% Critical, 40% Urgent, 40% Routine

════════════════════════════════════════════════════════════

📋 FIFO Queue (First-Come, First-Served)
────────────────────────────────────────────────────────────

📊 Wait Time Statistics by Triage Level:

Level      | Count | Avg Wait | Min Wait | Max Wait
-----------|-------|----------|----------|----------
Critical   |     6 |     45.2 |      0.0 |     89.3
Urgent     |    12 |     52.8 |      1.2 |    102.4
Routine    |    12 |     48.9 |      0.0 |     95.7
-----------|-------|----------|----------|----------
Overall    |    30 |     49.6 |      0.0 |    102.4

════════════════════════════════════════════════════════════

⭐ Priority Queue (Triage-Based)
────────────────────────────────────────────────────────────

📊 Wait Time Statistics by Triage Level:

Level      | Count | Avg Wait | Min Wait | Max Wait
-----------|-------|----------|----------|----------
Critical   |     6 |      8.3 |      0.0 |     21.5
Urgent     |    12 |     38.7 |      0.0 |     78.9
Routine    |    12 |     82.4 |     15.3 |    125.6
-----------|-------|----------|----------|----------
Overall    |    30 |     51.2 |      0.0 |    125.6

════════════════════════════════════════════════════════════

💡 Key Insights:

   Critical patients wait 81.6% less with priority queuing
   FIFO avg: 45.2 min | Priority avg: 8.3 min

   Routine patients wait 68.5% more (acceptable trade-off)
   FIFO avg: 48.9 min | Priority avg: 82.4 min

   ✓ Priority queuing saves lives by treating critical cases faster
   ✓ Overall system efficiency remains similar
   ✓ Resource allocation matches medical urgency
```

## Key Takeaways

1. **Critical Care Benefits**: Priority queuing dramatically reduces wait times for critical patients (typically 70-85% reduction)

2. **Acceptable Trade-offs**: Routine patients wait longer, but this is medically appropriate since their conditions are non-urgent

3. **Resource Efficiency**: Total resource utilization remains similar, but allocation better matches medical need

4. **Real-World Applicability**: This pattern applies to any scenario where requests have varying importance:
   - Tech support ticket systems (critical bugs vs feature requests)
   - Manufacturing job scheduling (rush orders vs regular production)
   - Network packet routing (real-time video vs file downloads)

## Implementation Highlights

### Creating a Priority-Based Resource

```typescript
const er = new Resource(sim, 2, {
  name: 'ER Doctors',
  queueDiscipline: 'priority',  // Use priority queue
});
```

### Requesting with Priority

```typescript
function* patient(triage: TriageLevel) {
  // Lower number = higher priority
  yield er.request(triage);  // 1=Critical, 2=Urgent, 3=Routine

  // Receive treatment...
  yield* timeout(treatmentDuration);

  er.release();
}
```

### Comparison Pattern

This example shows a powerful pattern for evaluating queue disciplines:
1. Run simulation with FIFO discipline
2. Run same simulation with priority discipline
3. Compare wait times by request type
4. Quantify trade-offs and benefits

You can adapt this pattern to evaluate queue disciplines for your own scenarios.

## Related Examples

- **[Traffic Light](../traffic-light/)** - SimEvent coordination
- **[Car Wash](../car-wash/)** - Basic resource usage
- **[Gas Station](../gas-station/)** - Buffer resources

## Learn More

See the [Queue Disciplines documentation](../../docs/queue-disciplines.md) for:
- FIFO, LIFO, and Priority disciplines
- Configurable tie-breakers
- Buffer and Store queue disciplines
- Performance characteristics
