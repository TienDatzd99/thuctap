import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles.css';

export default function Dashboard() {
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [difficulty, setDifficulty] = useState('medium');
  const navigate = useNavigate();

  useEffect(() => {
    // YÊU CẦU 1: GỌI API LẤY DANH SÁCH CHỦ ĐỀ
    // 1. Dùng fetch gọi GET tới 'http://localhost:4000/api/topics'
    // 2. setTopics(data) để hiển thị ra màn hình
    // (Tạm thời tôi dùng data giả để có giao diện)
    setTopics([
      { _id: '1', topicName: 'Phỏng vấn xin việc', description: 'Luyện tập trả lời phỏng vấn IT' },
      { _id: '2', topicName: 'Mua sắm', description: 'Hội thoại khi đi siêu thị' }
    ]);
  }, []);

  const handleStartSession = async () => {
    if (!selectedTopic) {
      alert("Vui lòng chọn một chủ đề!");
      return;
    }

    // Lấy token từ localStorage (người dùng đã đăng nhập)
    const token = localStorage.getItem('token');
    if (!token) {
      alert("Vui lòng đăng nhập trước!");
      navigate('/login');
      return;
    }
    try {

      const respond = await fetch('http://localhost:4000/api/sessions/start', {
        method: Post,
        'Authorization': `Bearer ${token}`,
        body: JSON.stringify({
          topicId: selectedTopic._id,
          difficulty: difficulty,
        })

      });
      const data = await respond.json();
      if (!respond.ok) {
        alert(data.error)
      } else {
        navigate(`/classroom/${data._id}`)
      }
    } catch (error) {
      alert("Không thể kết nối tới server!");
    }

  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Chọn chủ đề đàm thoại</h1>
        <button className="btn-logout" onClick={() => {
          localStorage.removeItem('token');
          navigate('/login');
        }}>Đăng xuất</button>
      </header>

      <div className="dashboard-content">
        <div className="topics-grid">
          {topics.map(topic => (
            <div
              key={topic._id}
              className={`topic-card ${selectedTopic?._id === topic._id ? 'selected' : ''}`}
              onClick={() => setSelectedTopic(topic)}
            >
              <h3>{topic.topicName}</h3>
              <p>{topic.description}</p>
            </div>
          ))}
        </div>

        {selectedTopic && (
          <div className="session-config">
            <h3>Đã chọn: {selectedTopic.topicName}</h3>
            <div className="form-group">
              <label>Độ khó</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="easy">Dễ (Easy)</option>
                <option value="medium">Trung bình (Medium)</option>
                <option value="hard">Khó (Hard)</option>
              </select>
            </div>
            <button className="btn-primary" onClick={handleStartSession}>
              Bắt đầu luyện tập
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
