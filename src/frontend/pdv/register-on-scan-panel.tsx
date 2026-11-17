import React, { useEffect, useRef } from 'react';
import { NewProductPanel } from '@/frontend/ui/new-product-panel';
import type { useRegisterOnScan } from '@/frontend/pdv/use-register-on-scan';

const noop = () => {};

/**
 * The shared new product panel for the sales screen: no stock field, no duplicate-code check (the server answers 409).
 * Its styles are scoped under .management-page; the wrapper gives them that scope without drawing a box of its own.
 */
export function RegisterOnScanPanel({ register }: { register: ReturnType<typeof useRegisterOnScan> }) {
  const scopeRef = useRef<HTMLDivElement>(null);
  // The code starts selected: a reader scan typed into the field replaces it instead of being added to it.
  useEffect(() => {
    scopeRef.current?.querySelector<HTMLInputElement>('#np-barcode')?.select();
  }, []);
  return (
    <div ref={scopeRef} className="management-page" style={{ display: 'contents' }}>
      <NewProductPanel
        barcode={register.barcode}
        name={register.name}
        unit={register.unit}
        price={register.price}
        stock="0"
        stockControl={false}
        processing={register.processing}
        barcodeNote={null}
        scanWarning={false}
        closing={register.closing}
        error={register.error}
        nameRef={register.nameRef}
        onBarcode={register.setBarcode}
        onName={register.setName}
        onUnit={register.setUnit}
        onPrice={register.setPrice}
        onStock={noop}
        onSubmit={register.submit}
        onCancel={register.cancel}
        onClosed={register.finishClose}
        onBarcodeBlur={noop}
        onBarcodeKeyDown={register.handleBarcodeKeyDown}
      />
    </div>
  );
}
