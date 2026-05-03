/**
 * Courier Partner Database
 * Base = base rate, Add = additional per slab, Slab = weight slab in kg
 */

export const COURIERS = {
  tirupati: {
    name: 'Tirupati',
    base: 50,
    add: 50,
    baseWeight: 1.0,
    slab: 1.0,
    eta: '4-7 days',
    trackUrl: 'https://www.tirupaticourier.com/Aborad_Tracking.aspx',
  },
  dtdc_surface: {
    name: 'DTDC Surface',
    base: 100,
    add: 85,
    baseWeight: 1.0,
    slab: 0.5,
    eta: '4-7 days',
    trackUrl: 'https://www.dtdc.in/tracking.asp',
  },
  dtdc_express: {
    name: 'DTDC Express',
    base: 120,
    add: 110,
    baseWeight: 1.0,
    slab: 0.5,
    eta: '4-5 days',
    trackUrl: 'https://www.dtdc.in/tracking.asp',
  },
  bluedart: {
    name: 'Bluedart',
    base: 130,
    add: 130,
    baseWeight: 1.0,
    slab: 0.5,
    eta: '2-3 days',
    trackUrl: 'https://www.bluedart.com/tracking',
  },
};
