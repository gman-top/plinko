import React from 'react';
import { useGame } from '../state/gameStore.js';

export default function BottomControls() {
  const bet = useGame(s => s.bet);
  const ballsAmount = useGame(s => s.ballsAmount);
  const auto = useGame(s => s.auto);
  const features = useGame(s => s.features);
  const setBet = useGame(s => s.setBet);
  const setBalls = useGame(s => s.setBalls);
  const setAuto = useGame(s => s.setAuto);
  const toggleFeature = useGame(s => s.toggleFeature);

  return (
    <>
      <div className="panel buyFeat">
        <div className="lbl">BUY FEATURES</div>
        <div className="buyFeatIcons">
          <div className={`fi purple${features.mult ? ' act' : ''}`} onClick={() => toggleFeature('mult')}>×</div>
          <div className={`fi blue${features.respin ? ' act' : ''}`}  onClick={() => toggleFeature('respin')}>↻</div>
          <div className={`fi wild${features.multi ? ' act' : ''}`}   onClick={() => toggleFeature('multi')}>⚡</div>
        </div>
      </div>

      <div className="panel ballsAmt">
        <div className="lbl">BALLS AMOUNT</div>
        <div className="ctrl">
          <div className="arrow l" onClick={() => setBalls(ballsAmount - 1)} />
          <div className="val">{ballsAmount}</div>
          <div className="arrow r" onClick={() => setBalls(ballsAmount + 1)} />
        </div>
      </div>

      <div className="panel betAmt">
        <div className="lbl">BET AMOUNT FUN</div>
        <div className="ctrl">
          <div className="arrow l" onClick={() => setBet(bet - 0.5)} />
          <div className="val">{bet.toFixed(2)}</div>
          <div className="arrow r" onClick={() => setBet(bet + 0.5)} />
        </div>
      </div>

      <div className="panel autoCtrl">
        <div className="lbl">AUTO</div>
        <div className="ctrl">
          <div className="arrow l" onClick={() => setAuto(auto - 1)} />
          <div className="val">{auto}</div>
          <div className="arrow r" onClick={() => setAuto(auto + 1)} />
        </div>
      </div>
    </>
  );
}
