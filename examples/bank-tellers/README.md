# Bank Tellers Simulation Example

Models a bank branch with teller windows serving customers with different transaction types and SLA tracking.

## Scenario

A bank operates during business hours with customers arriving for various transactions:

- **Quick Transactions** (70%): Deposits, withdrawals, check cashing (3 min avg)
- **Complex Transactions** (30%): Loans, account opening, problem resolution (10 min avg)

The bank has a Service Level Agreement (SLA): **Serve customers within 10 minutes**.

## Process Flow

```
Customer Arrives
     |
     v
[Wait in Queue] -> Teller Available
     |
     v
Service Transaction (time depends on type)
     |
     v
Release Teller
     |
     v
Customer Leaves
```

## Performance Tracking

The simulation tracks:
- **Wait times** (overall and by transaction type)
- **SLA compliance** (% customers served within target)
- **Teller utilization** (how busy tellers are)
- **Service mix** (distribution of transaction types)

## Running the Example

```bash
# From the examples/bank-tellers directory
npx tsx index.ts

# Or from the project root
npx tsx examples/bank-tellers/index.ts
```

## What It Demonstrates

1. **Service Differentiation**: Different service times for different transaction types
2. **SLA Tracking**: Measuring performance against targets
3. **Capacity Planning**: Balancing staff levels with customer demand
4. **Performance Metrics**: Comprehensive operational dashboards
5. **Data-Driven Recommendations**: Automated staffing suggestions

## Expected Output

```
============================================================
Bank Tellers Simulation
============================================================
Simulation duration: 6 hours
Arrival rate: 12 customers/hour
Number of tellers: 3
SLA target: Serve within 10 minutes
Random seed: 789

Running simulation...
Simulation completed in XXXms
Simulated time: X.XX hours
Events processed: XXX

============================================================
Simulation Results
============================================================

Service Summary:
  Total customers served: XX
  Quick transactions: XX (XX.X%)
  Complex transactions: XX (XX.X%)
  Throughput: XX.X customers/hour

Wait Time Performance:
  Average wait time: X.X minutes
  Quick transactions: X.X minutes
  Complex transactions: X.X minutes

SLA Compliance:
  Target: 10 minutes or less
  Met SLA: XX customers (XX.X%)
  Missed SLA: XX customers (XX.X%)
  Average SLA violation: X.X minutes over target

Teller Utilization:
  Utilization: XX.X%
  Average queue length: X.XX customers
  Total wait time: X.XX hours per customer

Time in Bank:
  Average total time: XX.X minutes

============================================================
Performance Assessment
============================================================

SLA Compliance Grade:
  [****-] Good (90-95%)

Staffing Recommendations:
  [OK] WELL-STAFFED: Current staffing appears optimal

Service Mix Analysis:
  [OK] Balanced service mix

============================================================
```

## Key Parameters

```typescript
const SIMULATION_HOURS = 6;
const CUSTOMER_ARRIVAL_RATE = 12;  // customers per hour
const NUM_TELLERS = 3;
const SLA_WAIT_TIME_MINUTES = 10;

// Service times
const QUICK_SERVICE_MEAN = 0.05 hours     // 3 minutes
const COMPLEX_SERVICE_MEAN = 0.167 hours  // 10 minutes

// Transaction mix: 70% quick, 30% complex
```

## Experimentation Ideas

### Scenario 1: Rush Hour
```typescript
const CUSTOMER_ARRIVAL_RATE = 20;  // Peak period
```
**Expected**: SLA violations increase, tellers overloaded, staffing recommendations trigger

### Scenario 2: Understaffed
```typescript
const NUM_TELLERS = 2;
```
**Expected**: Longer waits, lower SLA compliance, high utilization

### Scenario 3: Stricter SLA
```typescript
const SLA_WAIT_TIME_MINUTES = 5;  // More aggressive target
```
**Expected**: Lower compliance rate, may need more staff

### Scenario 4: More Complex Transactions
```typescript
// In generateTransactionType()
return rng.uniform(0, 1) < 0.4 ? 'quick' : 'complex';  // 40% quick, 60% complex
```
**Expected**: Longer service times, need more tellers

### Scenario 5: Faster Service
```typescript
const QUICK_SERVICE_MEAN = 0.033;     // 2 minutes
const COMPLEX_SERVICE_MEAN = 0.117;   // 7 minutes
```
**Expected**: Better SLA compliance, higher throughput

## Performance Metrics Explained

### SLA Compliance Grades
- **[*****] Excellent**: >=95% of customers served within SLA
- **[****-] Good**: 90-95% compliance
- **[***--] Fair**: 80-90% compliance
- **[**---] Poor**: <80% compliance

### Utilization Guidelines
- **< 50%**: Overstaffed (too many idle tellers)
- **50-85%**: Well-balanced (efficient staffing)
- **> 85%**: Understaffed (long queues, stressed staff)

### Staffing Decisions
The simulation provides automated recommendations:
- **Add tellers** if: Utilization >85% OR average wait >SLA
- **Reduce tellers** if: Utilization <50%
- **Keep current** if: balanced metrics

## Real-World Applications

This pattern applies to:
- **Banking**: Teller windows, loan officers, customer service
- **Retail**: Checkout lanes, customer service desks
- **Healthcare**: Check-in desks, triage stations
- **Government**: DMV counters, permit offices
- **Call Centers**: Agent pools, support queues

## What You Learn

1. **SLA Management**: Tracking and optimizing service level agreements
2. **Service Mix**: Handling different transaction types with varying durations
3. **Capacity Planning**: Right-sizing staff for demand
4. **Performance Dashboards**: Comprehensive operational metrics
5. **Decision Support**: Data-driven staffing recommendations

## Extending This Example

Try adding:
- **Priority customers**: VIP/Premium members skip the queue
- **Break schedules**: Tellers take lunch breaks (reduced capacity)
- **Time-of-day patterns**: Morning rush, lunch lull, afternoon spike
- **Express lane**: Dedicated teller for quick transactions only
- **Specialist tellers**: Some tellers only handle complex transactions
- **Customer abandonment**: Customers leave if wait is too long
- **Training effects**: New tellers are slower than experienced ones
- **Multiple queues**: Separate queues vs. single queue for all tellers

## Advanced Analysis

### What-If Analysis
Run multiple scenarios to find optimal staffing:
```typescript
for (let tellers = 2; tellers <= 5; tellers++) {
  const result = runSimulation(tellers);
  console.log(`${tellers} tellers: ${result.sla.complianceRate * 100}% SLA`);
}
```

### Cost-Benefit Analysis
Consider:
- Cost of hiring additional teller: $X per hour
- Cost of SLA violation: $Y per customer
- Find optimal balance

### Queue Theory Validation
For M/M/c queue with:
- lambda = 12 customers/hour
- mu = 20 customers/hour (average service rate)
- c = 3 servers

Compare simulation results to M/M/c formulas.
