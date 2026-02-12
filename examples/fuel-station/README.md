# Fuel Station Simulation

A discrete-event simulation of a gas station with a fuel tank serving trucks and receiving tanker deliveries.

## Overview

This example demonstrates how to use the **Buffer** resource to model inventory systems with homogeneous quantities (fuel). The simulation shows:

- **Producer-Consumer Pattern**: Tankers produce (deliver fuel), trucks consume (refuel)
- **Inventory Management**: Track fuel levels and prevent stockouts
- **Queue Management**: Handle waiting when fuel is temporarily unavailable
- **Statistics Collection**: Monitor operations, wait times, and inventory metrics

## Scenario

A gas station operates for 24 hours with:
- **Fuel Tank**: 10,000 gallon capacity, starts at 50% (5,000 gallons)
- **Trucks**: Arrive every ~7.5 minutes, need 50-150 gallons each
- **Tankers**: Deliver 5,000 gallons every 6 hours
- **Refuel Time**: 6 minutes per truck
- **Delivery Time**: 30 minutes per tanker

## Key Concepts

### Buffer Resource

Unlike `Resource` (which manages discrete capacity units), `Buffer` manages a continuous quantity:

```typescript
const fuelTank = new Buffer(sim, TANK_CAPACITY, {
  name: 'Fuel Tank',
  initialLevel: INITIAL_FUEL
});
```

### Get Operations (Consumers)

Trucks request fuel from the buffer. If insufficient fuel is available, they wait:

```typescript
// Request fuel - blocks if not enough available
yield fuelTank.get(fuelNeeded);
```

### Put Operations (Producers)

Tankers deliver fuel to the buffer. If tank is too full, they wait:

```typescript
// Deliver fuel - blocks if not enough space
yield fuelTank.put(TANKER_DELIVERY_AMOUNT);
```

## Running the Example

```bash
# From the discrete-sim root directory
npx tsx examples/fuel-station/index.ts

# Or compile and run with Node.js
npm run build
node examples/fuel-station/index.js
```

## Sample Output

```
Starting Fuel Station Simulation...

[0.00h] Truck 1 arrives, needs 89 gallons (tank level: 5000)
[0.00h] Truck 1 starts refueling 89 gallons (tank now: 4911)
[0.10h] Truck 1 departs (refueled 89 gallons)
[0.12h] Truck 2 arrives, needs 127 gallons (tank level: 4911)
...
[6.00h] 🚛 TANKER 1 arrives with 5000 gallons (tank: 2347/10000)
[6.50h] 🚛 TANKER 1 delivered 5000 gallons (tank now: 7347/10000, available: 2653)
...

======================================================================
FUEL STATION SIMULATION RESULTS
======================================================================
Simulation Duration: 24 hours

Fuel Tank Capacity: 10000 gallons
Initial Fuel Level: 5000 gallons
Final Fuel Level: 3456 gallons

──────────────────────────────────────────────────────────────────────
OPERATIONS SUMMARY
──────────────────────────────────────────────────────────────────────
Total Trucks Served: 187
Total Fuel Dispensed: 16544 gallons
Average Fuel per Truck: 88.5 gallons

Total Tanker Deliveries: 4
Total Fuel Delivered: 20000 gallons

──────────────────────────────────────────────────────────────────────
QUEUE PERFORMANCE
──────────────────────────────────────────────────────────────────────
Average Truck Wait Time: 1.23 minutes
Average Truck Queue Length: 0.16

Average Tanker Wait Time: 0.00 minutes (never waited)
Average Tanker Queue Length: 0.00

──────────────────────────────────────────────────────────────────────
INVENTORY METRICS
──────────────────────────────────────────────────────────────────────
Average Fuel Level: 5234 gallons (52.3% capacity)
Inventory Turnover: 3.16x
Net Fuel Flow: +3456 gallons
======================================================================
```

## Insights

### Blocking Behavior

- **Trucks block** when fuel level < requested amount
- **Tankers block** when available space < delivery amount
- All blocking is FIFO (first-in, first-out)

### Low Fuel Warnings

The simulation monitors fuel levels and warns when inventory drops below 1,000 gallons:

```
[15.32h] ⚠️  WARNING: Fuel tank running low (876 gallons remaining)
```

### Statistics

The Buffer automatically tracks:
- **Operations**: Total gets/puts and amounts
- **Wait Times**: Average time spent waiting in queue
- **Queue Lengths**: Time-weighted average queue sizes
- **Inventory Level**: Time-weighted average fuel level

## Experimentation Ideas

Try modifying parameters to explore different scenarios:

1. **Increase truck arrival rate** → More frequent stockouts
2. **Reduce tanker frequency** → Longer wait times for trucks
3. **Smaller tank capacity** → More blocking and queuing
4. **Variable delivery amounts** → Stochastic inventory management
5. **Add multiple tanks** → Parallel Buffer resources

## Related Examples

- `examples/warehouse/` - Using Store for distinct items (pallets)
- `examples/bank-tellers/` - Using Resource for discrete capacity
- `examples/mm1-queue/` - Basic queuing theory validation

## Learn More

- [Buffer API Reference](../../README.md#buffer)
- [Process-Based Modeling Guide](../../GUIDE.md)
- [Statistics Documentation](../../README.md#statistics)
