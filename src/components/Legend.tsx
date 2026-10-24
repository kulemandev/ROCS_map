import { rocLegendItems } from '../rocs/legend';

export function Legend() {
  const deploymentItems = rocLegendItems.filter(
    (item) => item.algorithm === 'HSRS' || item.algorithm === 'ADSS' || item.algorithm === 'PRIS-R',
  );

  return (
    <div className="legend-groups">
      <div>
        <h3 className="legend-group__title">Base-station deployment</h3>
        <div className="legend-list">
          {deploymentItems.map((item) => (
            <div key={item.algorithm} className="legend-item">
              <span className="legend-item__antenna" style={{ color: item.color }} />
              <div>
                <strong>{item.algorithm}</strong>
                <p>{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="legend-group__title">Railway signalling</h3>
        <div className="legend-list">
          <div className="legend-item">
            <span className="legend-item__line" style={{ backgroundColor: '#f4511e' }} />
            <div>
              <strong>ETCS Level 2 / ERTMS</strong>
              <p>Newest supported signalling takes display priority.</p>
            </div>
          </div>
          <div className="legend-item">
            <span
              className="legend-item__line"
              style={{
                background:
                  'repeating-linear-gradient(90deg, #f4511e 0 8px, transparent 8px 13px)',
              }}
            />
            <div>
              <strong>2044 ERTMS plan</strong>
              <p>Dashed DGITM horizon-2044 planning sections.</p>
            </div>
          </div>
          <div className="legend-item">
            <span className="legend-item__line" style={{ backgroundColor: '#2f9e44' }} />
            <div>
              <strong>KVB / TVM</strong>
              <p>Equivalent green signalling behavior on the map.</p>
            </div>
          </div>
          <div className="legend-item">
            <span className="legend-item__line" style={{ backgroundColor: '#111111' }} />
            <div>
              <strong>Tunnel</strong>
              <p>Black railway tunnel overlay.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
