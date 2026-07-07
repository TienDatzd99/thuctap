import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles.css';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('http://localhost:4000/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, fullName: name })
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Đăng ký thất bại');
      } else {
        navigate('/login');
      }
    } catch (err) {
      setError('Lỗi kết nối tới máy chủ, vui lòng thử lại.');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>Đăng Ký</h2>
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label>Tên</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nhập tên của bạn"
              required
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Nhập email của bạn"
              required
            />
          </div>

          <div className="form-group">
            <label>Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
              required
            />
          </div>

          <button type="submit" className="btn-primary">Đăng ký</button>
        </form>

        <p className="auth-redirect">
          Đã có tài khoản? <span onClick={() => navigate('/login')}>Đăng nhập</span>
        </p>
      </div>
    </div>
  );
}
