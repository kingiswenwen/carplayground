import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles.css';
import './styles/immersive.css';
import './styles/motion-assembly.css';
class Recovery extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main className="empty-state"><h1>小车休息一下</h1><p>这次没能准备好。可以刷新重试，也可以回展厅。</p><button className="button primary" onClick={() => { window.location.hash = '/cars'; window.location.reload(); }}>重新打开展厅</button></main> : this.props.children;
  }
}
createRoot(document.getElementById('root')!).render(<StrictMode><Recovery><App /></Recovery></StrictMode>);
