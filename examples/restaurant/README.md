# Restaurant Simulation Example

Models a restaurant service with tables and servers, demonstrating customer flow and service dynamics.

## Scenario

A restaurant operates during dinner service:

1. **Customer groups arrive** at random intervals (solo, couples, groups)
2. **Wait for table** based on availability
3. **Server takes order** (server required)
4. **Customers eat** (server not needed during meal)
5. **Server processes payment** (server required)
6. **Table cleanup** and turnover

Different group sizes create varying demand patterns.

## Resources

- **Tables** (10): Seating capacity limit
- **Servers** (4): Staff for taking orders and processing payments

## Process Flow

```
Group Arrives
     |
     v
[Wait for Table] -> Get Seated
     |
     v
[Wait for Server] -> Place Order -> Server Released
     |
     v
Eat Meal (45 min +/-15 min)
     |
     v
[Wait for Server] -> Pay Bill -> Server Released
     |
     v
Table Cleanup (5 min)
     |
     v
Leave Restaurant
```

## Running the Example

```bash
# From the examples/restaurant directory
npx tsx index.ts

# Or from the project root
npx tsx examples/restaurant/index.ts
```

## What It Demonstrates

1. **Variable Group Sizes**: Different customer group sizes (1-6 people)
2. **Resource Sharing**: Servers handle multiple tables sequentially
3. **Service Phases**: Multiple interactions with shared resources
4. **Customer Experience Metrics**: Wait times, satisfaction assessment
5. **Capacity Planning**: Balancing tables vs. servers

## Expected Output

```
============================================================
Restaurant Simulation
============================================================
Simulation duration: 8 hours
Arrival rate: 5 groups/hour
Tables: 10
Servers: 4
Random seed: 456

Running simulation...
Simulation completed in XXXms
Simulated time: X.XX hours
Events processed: XXXX

============================================================
Simulation Results
============================================================

Service Summary:
  Groups served: XX
  Total customers: XXX
  Average group size: X.X people
  Throughput: X.X groups/hour

Customer Experience:
  Average wait time: XX.X minutes
  Average time in restaurant: XX.X minutes

  Wait time by group size:
    Solo diners (1): XX.X min
    Couples (2): XX.X min
    Groups (3+): XX.X min

Table Utilization:
  Utilization: XX.X%
  Average queue: X.XX groups waiting
  Average table wait: XX.X minutes

Server Utilization:
  Utilization: XX.X%
  Average queue: X.XX tables waiting

============================================================
Performance Assessment
============================================================

Customer Satisfaction:
  [****-] Good - Acceptable wait times

Resource Efficiency:
  [OK] Table utilization is balanced
  [OK] Server staffing is balanced

============================================================
```

## Key Parameters

```typescript
const SIMULATION_HOURS = 8;
const CUSTOMER_GROUP_ARRIVAL_RATE = 5;  // groups per hour
const NUM_TABLES = 10;
const NUM_SERVERS = 4;

// Group size distribution:
// 30% solo (1 person)
// 30% couples (2 people)
// 25% small groups (3-4 people)
// 15% large groups (5-6 people)

// Timing
const ORDER_TIME_MEAN = 0.1 hours    // 6 minutes
const MEAL_TIME_MEAN = 0.75 hours    // 45 minutes
const CLEANUP_TIME = 0.083 hours     // 5 minutes
```

## Experimentation Ideas

### Scenario 1: Peak Hours (High Demand)
```typescript
const CUSTOMER_GROUP_ARRIVAL_RATE = 10;  // Double the customers
```
**Expected**: Longer wait times, higher utilization, potential customer dissatisfaction

### Scenario 2: Fast Casual (Quick Service)
```typescript
const MEAL_TIME_MEAN = 0.33;  // 20 minutes
const MEAL_TIME_STDDEV = 0.1;
```
**Expected**: Higher throughput, better table turnover

### Scenario 3: Understaffed
```typescript
const NUM_SERVERS = 2;  // Half the servers
```
**Expected**: Server becomes bottleneck, slower service

### Scenario 4: More Tables, Fewer Servers
```typescript
const NUM_TABLES = 15;
const NUM_SERVERS = 3;
```
**Expected**: Tables available but servers overworked

### Scenario 5: Family Style (Larger Groups)
```typescript
// Modify generateGroupSize() to favor groups of 4-6
if (rand < 0.2) return 1;   // 20% solo
if (rand < 0.3) return 2;   // 10% couples
return rng.randint(4, 6);   // 70% large groups
```
**Expected**: Lower throughput but higher customers per group

## Performance Metrics Explained

### Customer Satisfaction Ratings
- **[*****] Excellent**: < 10 min wait
- **[****-] Good**: 10-20 min wait
- **[***--] Fair**: 20-30 min wait
- **[**---] Poor**: > 30 min wait

### Resource Utilization Guidelines
- **< 50%**: Underutilized (excess capacity)
- **50-80%**: Well-balanced (optimal range)
- **> 80%**: Heavily utilized (potential bottleneck)

## Real-World Applications

This pattern applies to:
- **Food Service**: Restaurants, cafes, food courts
- **Healthcare**: Doctor's offices (rooms = tables, doctors = servers)
- **Retail**: Fitting rooms (rooms = tables, attendants = servers)
- **Services**: Hair salons, spa facilities
- **Entertainment**: Escape rooms, bowling alleys

## What You Learn

1. **Two-Resource Systems**: Balancing space (tables) vs. staff (servers)
2. **Service Phases**: Resources needed at different process stages
3. **Customer Segmentation**: Different group sizes have different patterns
4. **Experience Optimization**: Trade-offs between utilization and wait times
5. **Staffing Decisions**: When to add tables vs. servers

## Extending This Example

Try adding:
- **Reservations**: Priority for customers with bookings
- **Bar area**: Separate waiting area with bar service
- **Kitchen capacity**: Limited food preparation throughput
- **Rush hours**: Time-varying arrival rates (lunch vs. dinner)
- **Walk-outs**: Customers who leave if wait is too long
- **Server skill levels**: Different service speeds per server
- **Table preferences**: Window seats, booth seating
